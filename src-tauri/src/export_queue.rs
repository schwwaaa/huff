use crate::{
    automation::AutomationHandle,
    export::ExportHandle,
    offline_export::{OfflineExportConfig, OfflineExportHandle, OfflineExportMetadata},
    parameters::ParameterSnapshot,
    recording::RecordingHandle,
    renderer::{RenderCommand, RendererHandle},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const QUEUE_SCHEMA_VERSION: u32 = 2;
const MAX_QUEUE_JOBS: usize = 100;
const COORDINATOR_INTERVAL: Duration = Duration::from_millis(125);
const PROGRESS_PERSIST_INTERVAL: Duration = Duration::from_secs(1);

static JOB_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExportQueueJobStatus {
    Queued,
    Starting,
    Running,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}

impl ExportQueueJobStatus {
    fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Cancelled | Self::Interrupted
        )
    }

    fn is_retryable(&self) -> bool {
        matches!(self, Self::Failed | Self::Cancelled | Self::Interrupted)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportQueueJob {
    pub id: String,
    pub status: ExportQueueJobStatus,
    pub created_unix_ms: u64,
    pub started_unix_ms: Option<u64>,
    pub finished_unix_ms: Option<u64>,
    pub attempts: u32,
    pub phase: String,
    pub rendered_frames: u64,
    pub total_frames: u64,
    pub progress: f64,
    pub elapsed_seconds: f64,
    pub estimated_remaining_seconds: f64,
    pub encoded_bytes: u64,
    pub last_error: String,
    pub config: OfflineExportConfig,
    pub metadata: OfflineExportMetadata,
    pub parameter_snapshot: ParameterSnapshot,
}

impl ExportQueueJob {
    fn new(
        mut config: OfflineExportConfig,
        metadata: OfflineExportMetadata,
        parameter_snapshot: ParameterSnapshot,
    ) -> Self {
        let created = unix_ms();
        let id = format!(
            "hnw16-{created}-{}-{}",
            std::process::id(),
            JOB_COUNTER.fetch_add(1, Ordering::AcqRel)
        );
        config.queue_job_id = id.clone();
        Self {
            id,
            status: ExportQueueJobStatus::Queued,
            created_unix_ms: created,
            started_unix_ms: None,
            finished_unix_ms: None,
            attempts: 0,
            phase: "queued".into(),
            rendered_frames: 0,
            total_frames: config.total_frames(),
            progress: 0.0,
            elapsed_seconds: 0.0,
            estimated_remaining_seconds: 0.0,
            encoded_bytes: 0,
            last_error: String::new(),
            config,
            metadata,
            parameter_snapshot,
        }
    }

    fn reset_for_retry(&mut self) {
        self.status = ExportQueueJobStatus::Queued;
        self.started_unix_ms = None;
        self.finished_unix_ms = None;
        self.phase = "queued".into();
        self.rendered_frames = 0;
        self.total_frames = self.config.total_frames();
        self.progress = 0.0;
        self.elapsed_seconds = 0.0;
        self.estimated_remaining_seconds = 0.0;
        self.encoded_bytes = 0;
        self.last_error.clear();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportQueueFile {
    schema_version: u32,
    paused: bool,
    jobs: Vec<ExportQueueJob>,
}

#[derive(Debug)]
struct ExportQueueState {
    paused: bool,
    active_job_id: Option<String>,
    waiting_reason: String,
    jobs: Vec<ExportQueueJob>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportQueueJobInfo {
    pub id: String,
    pub status: ExportQueueJobStatus,
    pub created_unix_ms: u64,
    pub started_unix_ms: Option<u64>,
    pub finished_unix_ms: Option<u64>,
    pub attempts: u32,
    pub phase: String,
    pub output_path: String,
    pub source_path: String,
    pub profile: String,
    pub profile_label: String,
    pub output_kind: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub duration_seconds: f64,
    pub automation_enabled: bool,
    pub automation_name: String,
    pub automation_duration_seconds: f64,
    pub automation_event_count: usize,
    pub automation_loop: bool,
    pub rendered_frames: u64,
    pub total_frames: u64,
    pub progress: f64,
    pub elapsed_seconds: f64,
    pub estimated_remaining_seconds: f64,
    pub encoded_bytes: u64,
    pub last_error: String,
    pub output_exists: bool,
    pub source_exists: bool,
    pub retryable: bool,
    pub removable: bool,
}

impl From<&ExportQueueJob> for ExportQueueJobInfo {
    fn from(job: &ExportQueueJob) -> Self {
        Self {
            id: job.id.clone(),
            status: job.status.clone(),
            created_unix_ms: job.created_unix_ms,
            started_unix_ms: job.started_unix_ms,
            finished_unix_ms: job.finished_unix_ms,
            attempts: job.attempts,
            phase: job.phase.clone(),
            output_path: job.config.path.display().to_string(),
            source_path: job.config.source_path.display().to_string(),
            profile: job.config.profile.clone(),
            profile_label: job.config.profile_label().into(),
            output_kind: job.config.output_kind().into(),
            width: job.config.output_width,
            height: job.config.output_height,
            fps: job.config.fps,
            duration_seconds: job.config.duration_seconds,
            automation_enabled: job.config.automation_clip.is_some(),
            automation_name: job
                .config
                .automation_clip
                .as_ref()
                .map(|clip| clip.name.clone())
                .unwrap_or_default(),
            automation_duration_seconds: job
                .config
                .automation_clip
                .as_ref()
                .map(|clip| clip.duration_seconds)
                .unwrap_or(0.0),
            automation_event_count: job
                .config
                .automation_clip
                .as_ref()
                .map(|clip| clip.events.len())
                .unwrap_or(0),
            automation_loop: job.config.automation_loop,
            rendered_frames: job.rendered_frames,
            total_frames: job.total_frames,
            progress: job.progress,
            elapsed_seconds: job.elapsed_seconds,
            estimated_remaining_seconds: job.estimated_remaining_seconds,
            encoded_bytes: job.encoded_bytes,
            last_error: job.last_error.clone(),
            output_exists: job.config.path.exists(),
            source_exists: job.config.source_path.is_file(),
            retryable: job.status.is_retryable(),
            removable: job.status != ExportQueueJobStatus::Running
                && job.status != ExportQueueJobStatus::Starting,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportQueueInfo {
    pub paused: bool,
    pub active_job_id: String,
    pub waiting_reason: String,
    pub persistence_path: String,
    pub queued_count: usize,
    pub running_count: usize,
    pub completed_count: usize,
    pub failed_count: usize,
    pub cancelled_count: usize,
    pub interrupted_count: usize,
    pub jobs: Vec<ExportQueueJobInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportQueueReceipt {
    pub job_id: String,
    pub path: String,
    pub position: usize,
}

#[derive(Clone)]
pub struct ExportQueueHandle {
    state: Arc<RwLock<ExportQueueState>>,
    persistence_path: Arc<PathBuf>,
    shutdown: Arc<AtomicBool>,
}

impl ExportQueueHandle {
    pub fn start(
        persistence_path: PathBuf,
        renderer: RendererHandle,
        offline_export: OfflineExportHandle,
        recording: RecordingHandle,
        still_export: ExportHandle,
        automation: AutomationHandle,
    ) -> Result<Self, String> {
        let (mut loaded, load_warning) = match load_queue_file(&persistence_path) {
            Ok(file) => (file, String::new()),
            Err(error) => {
                let backup = backup_unreadable_queue(&persistence_path);
                let detail = backup
                    .map(|path| format!("{error}; unreadable state preserved at {}", path.display()))
                    .unwrap_or(error);
                (
                    ExportQueueFile {
                        schema_version: QUEUE_SCHEMA_VERSION,
                        paused: true,
                        jobs: Vec::new(),
                    },
                    detail,
                )
            }
        };
        let mut recovered_interrupted = false;
        for job in &mut loaded.jobs {
            if matches!(
                job.status,
                ExportQueueJobStatus::Starting | ExportQueueJobStatus::Running
            ) {
                job.finished_unix_ms = Some(unix_ms());
                if job.config.path.exists() {
                    job.status = ExportQueueJobStatus::Completed;
                    job.phase = "complete_recovered".into();
                    job.progress = 1.0;
                    job.rendered_frames = job.total_frames;
                    job.last_error =
                        "final destination existed during queue recovery; the transactional exporter had already committed the output"
                            .into();
                } else {
                    job.status = ExportQueueJobStatus::Interrupted;
                    job.phase = "interrupted".into();
                    job.last_error =
                        "HUFF closed before this export reached a terminal state; restart the job to render it again from frame zero"
                            .into();
                    recovered_interrupted = true;
                }
            }
        }
        if recovered_interrupted {
            loaded.paused = true;
        }
        let handle = Self {
            state: Arc::new(RwLock::new(ExportQueueState {
                paused: loaded.paused,
                active_job_id: None,
                waiting_reason: if !load_warning.is_empty() {
                    format!("queue state recovery: {load_warning}")
                } else if recovered_interrupted {
                    "queue paused after recovering an interrupted export".into()
                } else {
                    String::new()
                },
                jobs: loaded.jobs,
            })),
            persistence_path: Arc::new(persistence_path),
            shutdown: Arc::new(AtomicBool::new(false)),
        };
        handle.persist()?;

        let worker = handle.clone();
        thread::Builder::new()
            .name("huff-export-queue".into())
            .spawn(move || {
                coordinator_loop(
                    worker,
                    renderer,
                    offline_export,
                    recording,
                    still_export,
                    automation,
                )
            })
            .map_err(|error| format!("could not start export queue coordinator: {error}"))?;
        Ok(handle)
    }

    pub fn info(&self) -> ExportQueueInfo {
        let state = self.state.read().expect("export queue state poisoned");
        let mut queued_count = 0;
        let mut running_count = 0;
        let mut completed_count = 0;
        let mut failed_count = 0;
        let mut cancelled_count = 0;
        let mut interrupted_count = 0;
        for job in &state.jobs {
            match job.status {
                ExportQueueJobStatus::Queued => queued_count += 1,
                ExportQueueJobStatus::Starting | ExportQueueJobStatus::Running => {
                    running_count += 1
                }
                ExportQueueJobStatus::Completed => completed_count += 1,
                ExportQueueJobStatus::Failed => failed_count += 1,
                ExportQueueJobStatus::Cancelled => cancelled_count += 1,
                ExportQueueJobStatus::Interrupted => interrupted_count += 1,
            }
        }
        ExportQueueInfo {
            paused: state.paused,
            active_job_id: state.active_job_id.clone().unwrap_or_default(),
            waiting_reason: state.waiting_reason.clone(),
            persistence_path: self.persistence_path.display().to_string(),
            queued_count,
            running_count,
            completed_count,
            failed_count,
            cancelled_count,
            interrupted_count,
            jobs: state.jobs.iter().map(ExportQueueJobInfo::from).collect(),
        }
    }

    pub fn enqueue(
        &self,
        config: OfflineExportConfig,
        metadata: OfflineExportMetadata,
        parameter_snapshot: ParameterSnapshot,
    ) -> Result<ExportQueueReceipt, String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "export queue state poisoned".to_string())?;
        if state.jobs.len() >= MAX_QUEUE_JOBS {
            return Err(format!(
                "the export queue is limited to {MAX_QUEUE_JOBS} jobs; clear finished jobs before adding another"
            ));
        }
        if !config.source_path.is_file() {
            return Err("the deterministic export source file is unavailable".into());
        }
        if config.path.exists() {
            return Err("the deterministic export destination already exists".into());
        }
        if state.jobs.iter().any(|job| {
            !job.status.is_terminal() && same_path(&job.config.path, &config.path)
        }) {
            return Err("another queued export already targets this destination".into());
        }
        let job = ExportQueueJob::new(config, metadata, parameter_snapshot);
        let job_id = job.id.clone();
        let path = job.config.path.display().to_string();
        state.jobs.push(job);
        let position = state
            .jobs
            .iter()
            .filter(|job| job.status == ExportQueueJobStatus::Queued)
            .count();
        persist_state(&self.persistence_path, &state)?;
        if let Some(job) = state.jobs.last() {
            let _ = write_job_descriptor(job);
        }
        Ok(ExportQueueReceipt {
            job_id,
            path,
            position,
        })
    }

    pub fn set_paused(&self, paused: bool) -> Result<(), String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "export queue state poisoned".to_string())?;
        state.paused = paused;
        state.waiting_reason = if paused {
            "queue paused by user".into()
        } else {
            String::new()
        };
        persist_state(&self.persistence_path, &state)
    }

    pub fn cancel_active(&self, renderer: &RendererHandle, offline_export: &OfflineExportHandle) {
        offline_export.request_cancel();
        renderer.send(RenderCommand::CancelOfflineExport);
        if let Ok(mut state) = self.state.write() {
            if let Some(active_id) = state.active_job_id.clone() {
                if let Some(job) = state.jobs.iter_mut().find(|job| job.id == active_id) {
                    job.phase = "cancelling".into();
                    let _ = write_job_descriptor(job);
                }
            }
        }
    }

    pub fn cancel_job(&self, job_id: &str) -> Result<(), String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "export queue state poisoned".to_string())?;
        if state.active_job_id.as_deref() == Some(job_id) {
            return Err("the active export must be cancelled with the active Cancel button".into());
        }
        let job = state
            .jobs
            .iter_mut()
            .find(|job| job.id == job_id)
            .ok_or_else(|| "export queue job was not found".to_string())?;
        if job.status != ExportQueueJobStatus::Queued {
            return Err("only a queued export can be cancelled before it starts".into());
        }
        job.status = ExportQueueJobStatus::Cancelled;
        job.phase = "cancelled".into();
        job.finished_unix_ms = Some(unix_ms());
        job.last_error.clear();
        let descriptor = job.clone();
        persist_state(&self.persistence_path, &state)?;
        write_job_descriptor(&descriptor)
    }

    pub fn retry_job(&self, job_id: &str) -> Result<(), String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "export queue state poisoned".to_string())?;
        let index = state
            .jobs
            .iter()
            .position(|job| job.id == job_id)
            .ok_or_else(|| "export queue job was not found".to_string())?;
        let retry_path = state.jobs[index].config.path.clone();
        if !state.jobs[index].status.is_retryable() {
            return Err("only failed, cancelled, or interrupted exports can be restarted".into());
        }
        if retry_path.exists() {
            return Err(
                "the export destination now exists; use Repeat and choose a new destination".into(),
            );
        }
        if !state.jobs[index].config.source_path.is_file() {
            return Err("the source file is no longer available".into());
        }
        if state.jobs.iter().enumerate().any(|(other_index, other)| {
            other_index != index
                && !other.status.is_terminal()
                && same_path(&other.config.path, &retry_path)
        }) {
            return Err("another queued export already targets this destination".into());
        }
        state.jobs[index].reset_for_retry();
        let descriptor = state.jobs[index].clone();
        persist_state(&self.persistence_path, &state)?;
        write_job_descriptor(&descriptor)
    }

    pub fn repeat_job_to(
        &self,
        job_id: &str,
        path: PathBuf,
    ) -> Result<ExportQueueReceipt, String> {
        let template = self.job(job_id)?;
        let mut config = template.config;
        let mut metadata = template.metadata;
        config.path = path;
        retarget_metadata(&config, &mut metadata);
        metadata.created_unix_ms = u128::from(unix_ms());
        metadata.engine_build = "HNW-18".into();
        self.enqueue(config, metadata, template.parameter_snapshot)
    }

    pub fn remove_job(&self, job_id: &str) -> Result<(), String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "export queue state poisoned".to_string())?;
        if state.active_job_id.as_deref() == Some(job_id) {
            return Err("the active export cannot be removed".into());
        }
        let before = state.jobs.len();
        state.jobs.retain(|job| job.id != job_id);
        if state.jobs.len() == before {
            return Err("export queue job was not found".into());
        }
        persist_state(&self.persistence_path, &state)
    }

    pub fn clear_finished(&self) -> Result<usize, String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "export queue state poisoned".to_string())?;
        let active_id = state.active_job_id.clone();
        let before = state.jobs.len();
        state.jobs.retain(|job| {
            active_id.as_deref() == Some(job.id.as_str()) || !job.status.is_terminal()
        });
        let removed = before.saturating_sub(state.jobs.len());
        persist_state(&self.persistence_path, &state)?;
        Ok(removed)
    }

    pub fn move_job(&self, job_id: &str, direction: i32) -> Result<(), String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "export queue state poisoned".to_string())?;
        let index = state
            .jobs
            .iter()
            .position(|job| job.id == job_id)
            .ok_or_else(|| "export queue job was not found".to_string())?;
        if state.jobs[index].status != ExportQueueJobStatus::Queued {
            return Err("only queued exports can be reordered".into());
        }
        let step = if direction < 0 { -1_isize } else { 1_isize };
        let mut candidate = index as isize + step;
        while candidate >= 0 && candidate < state.jobs.len() as isize {
            let target = candidate as usize;
            if state.jobs[target].status == ExportQueueJobStatus::Queued {
                state.jobs.swap(index, target);
                persist_state(&self.persistence_path, &state)?;
                return Ok(());
            }
            candidate += step;
        }
        Ok(())
    }

    pub fn job(&self, job_id: &str) -> Result<ExportQueueJob, String> {
        self.state
            .read()
            .map_err(|_| "export queue state poisoned".to_string())?
            .jobs
            .iter()
            .find(|job| job.id == job_id)
            .cloned()
            .ok_or_else(|| "export queue job was not found".to_string())
    }

    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::Release);
    }

    fn persist(&self) -> Result<(), String> {
        let state = self
            .state
            .read()
            .map_err(|_| "export queue state poisoned".to_string())?;
        persist_state(&self.persistence_path, &state)
    }
}

fn coordinator_loop(
    queue: ExportQueueHandle,
    renderer: RendererHandle,
    offline_export: OfflineExportHandle,
    recording: RecordingHandle,
    still_export: ExportHandle,
    automation: AutomationHandle,
) {
    let mut last_progress_persist = Instant::now();
    while !queue.shutdown.load(Ordering::Acquire) {
        let offline = offline_export.info();
        let mut launch: Option<ExportQueueJob> = None;
        let mut persist_now = false;

        if let Ok(mut state) = queue.state.write() {
            if let Some(active_id) = state.active_job_id.clone() {
                if !offline.queue_job_id.is_empty() && offline.queue_job_id != active_id {
                    state.waiting_reason =
                        "waiting for the renderer to acknowledge the active queue job".into();
                } else if let Some(index) = state.jobs.iter().position(|job| job.id == active_id) {
                    let mut terminal_descriptor = None;
                    {
                        let job = &mut state.jobs[index];
                        job.rendered_frames = offline.rendered_frames;
                        job.total_frames = offline.total_frames.max(job.config.total_frames());
                        job.progress = offline.progress;
                        job.elapsed_seconds = offline.elapsed_seconds;
                        job.estimated_remaining_seconds = offline.estimated_remaining_seconds;
                        job.encoded_bytes = offline.encoded_bytes;
                        job.phase = offline.phase.clone();
                        if offline.active {
                            job.status = if offline.phase == "starting" {
                                ExportQueueJobStatus::Starting
                            } else {
                                ExportQueueJobStatus::Running
                            };
                        } else {
                            match offline.phase.as_str() {
                                "complete" => {
                                    job.status = ExportQueueJobStatus::Completed;
                                    job.phase = "complete".into();
                                    job.progress = 1.0;
                                    job.rendered_frames = job.total_frames;
                                    job.finished_unix_ms = Some(unix_ms());
                                    job.last_error.clear();
                                }
                                "cancelled" => {
                                    job.status = ExportQueueJobStatus::Cancelled;
                                    job.phase = "cancelled".into();
                                    job.finished_unix_ms = Some(unix_ms());
                                    job.last_error.clear();
                                }
                                "error" => {
                                    job.status = ExportQueueJobStatus::Failed;
                                    job.phase = "failed".into();
                                    job.finished_unix_ms = Some(unix_ms());
                                    job.last_error = offline.last_error.clone();
                                }
                                _ => {}
                            }
                            if job.status.is_terminal() {
                                terminal_descriptor = Some(job.clone());
                            }
                        }
                    }
                    if let Some(descriptor) = terminal_descriptor {
                        state.active_job_id = None;
                        state.waiting_reason.clear();
                        let _ = write_job_descriptor(&descriptor);
                        persist_now = true;
                    }
                } else {
                    state.active_job_id = None;
                    persist_now = true;
                }
            }

            if state.active_job_id.is_none() && !offline.active && !state.paused {
                let recording_info = recording.info();
                let still_info = still_export.info();
                if automation.is_recording() {
                    state.waiting_reason = "waiting for automation recording to stop".into();
                } else if recording_info.active || recording_info.finalizing {
                    state.waiting_reason = "waiting for live recording to stop".into();
                } else if still_info.active {
                    state.waiting_reason = "waiting for still export to finish".into();
                } else if let Some(index) = state
                    .jobs
                    .iter()
                    .position(|job| job.status == ExportQueueJobStatus::Queued)
                {
                    let mut descriptor = None;
                    let mut launched_id = None;
                    {
                        let job = &mut state.jobs[index];
                        if !job.config.source_path.is_file() {
                            job.status = ExportQueueJobStatus::Failed;
                            job.phase = "failed".into();
                            job.finished_unix_ms = Some(unix_ms());
                            job.last_error = "the queued source file no longer exists".into();
                            descriptor = Some(job.clone());
                            persist_now = true;
                        } else if job.config.path.exists() {
                            job.status = ExportQueueJobStatus::Failed;
                            job.phase = "failed".into();
                            job.finished_unix_ms = Some(unix_ms());
                            job.last_error =
                                "the queued destination now exists; remove it and retry, or repeat the job to a new destination"
                                    .into();
                            descriptor = Some(job.clone());
                            persist_now = true;
                        } else {
                            job.status = ExportQueueJobStatus::Starting;
                            job.phase = "starting".into();
                            job.attempts = job.attempts.saturating_add(1);
                            job.started_unix_ms = Some(unix_ms());
                            job.finished_unix_ms = None;
                            job.last_error.clear();
                            launched_id = Some(job.id.clone());
                            launch = Some(job.clone());
                            persist_now = true;
                        }
                    }
                    if let Some(job_id) = launched_id {
                        state.active_job_id = Some(job_id);
                        state.waiting_reason.clear();
                    }
                    if let Some(descriptor) = descriptor {
                        let _ = write_job_descriptor(&descriptor);
                    }
                } else {
                    state.waiting_reason.clear();
                }
            }

            if persist_now || last_progress_persist.elapsed() >= PROGRESS_PERSIST_INTERVAL {
                let _ = persist_state(&queue.persistence_path, &state);
                if let Some(active_id) = state.active_job_id.clone() {
                    if let Some(job) = state.jobs.iter().find(|job| job.id == active_id) {
                        let _ = write_job_descriptor(job);
                    }
                }
                last_progress_persist = Instant::now();
            }
        }

        if let Some(job) = launch {
            let result = renderer.start_offline_export(
                job.config.clone(),
                job.metadata.clone(),
                job.parameter_snapshot.clone(),
            );
            if let Err(error) = result {
                if let Ok(mut state) = queue.state.write() {
                    if let Some(current) = state.jobs.iter_mut().find(|item| item.id == job.id) {
                        current.status = ExportQueueJobStatus::Failed;
                        current.phase = "failed".into();
                        current.finished_unix_ms = Some(unix_ms());
                        current.last_error = error;
                        let descriptor = current.clone();
                        let _ = write_job_descriptor(&descriptor);
                    }
                    state.active_job_id = None;
                    let _ = persist_state(&queue.persistence_path, &state);
                }
            }
        }

        thread::sleep(COORDINATOR_INTERVAL);
    }
}

fn load_queue_file(path: &Path) -> Result<ExportQueueFile, String> {
    if !path.exists() {
        return Ok(ExportQueueFile {
            schema_version: QUEUE_SCHEMA_VERSION,
            paused: false,
            jobs: Vec::new(),
        });
    }
    let bytes = fs::read(path)
        .map_err(|error| format!("could not read export queue state: {error}"))?;
    let file: ExportQueueFile = serde_json::from_slice(&bytes)
        .map_err(|error| format!("could not parse export queue state: {error}"))?;
    if file.schema_version > QUEUE_SCHEMA_VERSION {
        return Err(format!(
            "export queue schema {} is newer than this build supports",
            file.schema_version
        ));
    }
    Ok(file)
}

fn backup_unreadable_queue(path: &Path) -> Option<PathBuf> {
    if !path.exists() {
        return None;
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("huff-export-queue.json");
    let backup = path.with_file_name(format!("{name}.unreadable-{}", unix_ms()));
    fs::rename(path, &backup).ok().map(|_| backup)
}

fn persist_state(path: &Path, state: &ExportQueueState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create export queue folder: {error}"))?;
    }
    let file = ExportQueueFile {
        schema_version: QUEUE_SCHEMA_VERSION,
        paused: state.paused,
        jobs: state.jobs.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&file)
        .map_err(|error| format!("could not serialize export queue state: {error}"))?;
    atomic_write(path, &bytes)
}

fn write_job_descriptor(job: &ExportQueueJob) -> Result<(), String> {
    let path = descriptor_path_for(&job.config);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create export descriptor folder: {error}"))?;
    }
    let bytes = serde_json::to_vec_pretty(job)
        .map_err(|error| format!("could not serialize export job descriptor: {error}"))?;
    atomic_write(&path, &bytes)
}

fn descriptor_path_for(config: &OfflineExportConfig) -> PathBuf {
    let name = config
        .path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("huff-export");
    config
        .path
        .with_file_name(format!("{name}.huff-queue-job.json"))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("huff-state.json");
    let temporary = path.with_file_name(format!(".{name}.tmp"));
    fs::write(&temporary, bytes)
        .map_err(|error| format!("could not write {}: {error}", temporary.display()))?;
    #[cfg(target_os = "windows")]
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("could not replace {}: {error}", path.display()))?;
    }
    fs::rename(&temporary, path)
        .map_err(|error| format!("could not finalize {}: {error}", path.display()))
}

fn retarget_metadata(config: &OfflineExportConfig, metadata: &mut OfflineExportMetadata) {
    metadata.frame_pattern = if config.is_image_sequence() {
        config.path.join("frame_%06d.png").display().to_string()
    } else {
        String::new()
    };
    metadata.audio_artifact = if config.include_audio && config.is_image_sequence() {
        config.path.join("audio.wav").display().to_string()
    } else if config.include_audio {
        config.path.display().to_string()
    } else {
        String::new()
    };
}

fn same_path(left: &Path, right: &Path) -> bool {
    if cfg!(target_os = "windows") {
        left.to_string_lossy().eq_ignore_ascii_case(right.to_string_lossy().as_ref())
    } else {
        left == right
    }
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}
