struct Uniforms {
    resolution_time: vec4<f32>,
    source_dimensions: vec4<f32>,
    source_state: vec4<f32>,
    controls0: vec4<f32>,
    controls1: vec4<f32>,
    feedback_transform: vec4<f32>,
    audio0: vec4<f32>,
    input0: vec4<f32>,
    network0: vec4<f32>,
    history_state: vec4<f32>,
    history_controls: vec4<f32>,
};

struct GesturePoint {
    position_velocity: vec4<f32>,
    pressure_age_tool_active: vec4<f32>,
};

struct GestureData {
    points: array<GesturePoint, 64>,
};

struct SignalData {
    values: array<f32, 160>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> gestures: GestureData;
@group(0) @binding(2) var<storage, read> signals: SignalData;

@group(1) @binding(0) var camera_texture: texture_2d<f32>;
@group(1) @binding(1) var video_texture: texture_2d<f32>;
@group(1) @binding(2) var source_sampler: sampler;

@group(2) @binding(0) var composite_texture: texture_2d<f32>;
@group(2) @binding(1) var previous_feedback: texture_2d<f32>;
@group(2) @binding(2) var feedback_sampler: sampler;
@group(2) @binding(3) var temporal_history: texture_2d_array<f32>;
@group(2) @binding(4) var temporal_history_sampler: sampler;

@group(3) @binding(0) var final_texture: texture_2d<f32>;
@group(3) @binding(1) var final_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_fullscreen(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(3.0, 1.0)
    );
    var texcoords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 2.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(2.0, 0.0)
    );
    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv = texcoords[vertex_index];
    return output;
}

fn background_color(mode: f32) -> vec3<f32> {
    let selection = u32(mode + 0.5);
    if (selection == 1u) {
        return vec3<f32>(0.0, 1.0, 0.0);
    }
    if (selection == 2u) {
        return vec3<f32>(0.0, 0.0, 1.0);
    }
    if (selection == 3u) {
        return vec3<f32>(1.0);
    }
    return vec3<f32>(0.0);
}

@fragment
fn fs_composite(input: VertexOutput) -> @location(0) vec4<f32> {
    let camera_available = u.source_state.x > 0.5;
    let video_available = u.source_state.y > 0.5;
    let base_enabled = u.source_state.w > 0.5;
    let background = background_color(u.source_state.z);

    var source = background;
    var source_available = false;
    // 0 = automatic, 1 = video, 2 = camera, 3 = none. Selection is
    // authoritative and independent from stale textures that may still exist
    // while an asynchronous decoder/capture worker is shutting down.
    let selected_source = u32(u.controls0.w + 0.5);
    if (selected_source == 1u) {
        if (video_available) {
            source = textureSample(video_texture, source_sampler, input.uv).rgb;
            source_available = true;
        }
    } else if (selected_source == 2u) {
        if (camera_available) {
            source = textureSample(camera_texture, source_sampler, input.uv).rgb;
            source_available = true;
        }
    } else if (selected_source == 0u) {
        if (camera_available) {
            source = textureSample(camera_texture, source_sampler, input.uv).rgb;
            source_available = true;
        } else if (video_available) {
            source = textureSample(video_texture, source_sampler, input.uv).rgb;
            source_available = true;
        }
    }

    let amount = clamp(u.controls0.x, 0.0, 1.0);
    var color = background;
    if (base_enabled && source_available) {
        color = mix(background, source, amount);
    }
    return vec4<f32>(color, 1.0);
}

@fragment
fn fs_history_capture(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(textureSample(final_texture, final_sampler, input.uv).rgb, 1.0);
}

fn temporal_history_color(uv: vec2<f32>) -> vec3<f32> {
    let count = u32(u.history_state.y + 0.5);
    let capacity = max(u32(u.history_state.z + 0.5), 1u);
    if (count == 0u) {
        return vec3<f32>(0.0);
    }
    let newest = u32(u.history_state.x + 0.5) % capacity;
    let depth_normalized = clamp(u.history_controls.y / 0.5, 0.0, 1.0);
    let frames_back = u32(round(depth_normalized * f32(count - 1u)));
    let layer = (newest + capacity - (frames_back % capacity)) % capacity;
    return textureSample(
        temporal_history,
        temporal_history_sampler,
        uv,
        i32(layer)
    ).rgb;
}

@fragment
fn fs_feedback(input: VertexOutput) -> @location(0) vec4<f32> {
    var source_color = textureSample(composite_texture, feedback_sampler, input.uv).rgb;
    let history_enabled = u.history_controls.x > 0.5 && u.history_state.y > 0.5;
    if (history_enabled) {
        let delayed = temporal_history_color(input.uv);
        let history_mix = clamp(u.history_controls.z, 0.0, 1.0)
            * clamp(u.history_controls.w, 0.0, 1.0);
        source_color = mix(source_color, delayed, history_mix);
    }
    let feedback_amount = clamp(u.controls0.y, 0.0, 1.0);
    let persistence = clamp(u.controls0.z, 0.0, 1.0);

    let render_size = max(u.resolution_time.xy, vec2<f32>(1.0));
    let translation = u.feedback_transform.xy / render_size;
    let scale = max(u.feedback_transform.z, 0.0001);
    let angle = u.feedback_transform.w;
    let centered = input.uv - vec2<f32>(0.5) - translation;
    let c = cos(-angle);
    let s = sin(-angle);
    let rotated = vec2<f32>(
        centered.x * c - centered.y * s,
        centered.x * s + centered.y * c
    ) / scale;
    let history_uv = rotated + vec2<f32>(0.5);
    let history_color = textureSample(previous_feedback, feedback_sampler, history_uv).rgb;

    // The source is always visible. Feedback only controls transformed temporal
    // accumulation, avoiding the black-start behavior of a pure history mix.
    let accumulated = source_color + history_color * feedback_amount * persistence;
    return vec4<f32>(accumulated, 1.0);
}

@fragment
fn fs_present(input: VertexOutput) -> @location(0) vec4<f32> {
    let render_size = max(u.resolution_time.xy, vec2<f32>(1.0));
    let surface_size = max(u.controls1.zw, vec2<f32>(1.0));
    let render_aspect = render_size.x / render_size.y;
    let surface_aspect = surface_size.x / surface_size.y;
    var uv = input.uv;

    // Fixed internal resolutions are presented with aspect-preserving
    // letterboxing rather than being stretched by the native window.
    if (surface_aspect > render_aspect) {
        let visible_width = render_aspect / surface_aspect;
        uv.x = (uv.x - 0.5) / visible_width + 0.5;
    } else {
        let visible_height = surface_aspect / render_aspect;
        uv.y = (uv.y - 0.5) / visible_height + 0.5;
    }
    if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }

    var color = textureSample(final_texture, final_sampler, uv).rgb;
    color = color * max(u.controls1.x, 0.0);
    color = (color - vec3<f32>(0.5)) * max(u.controls1.y, 0.0) + vec3<f32>(0.5);
    return vec4<f32>(max(color, vec3<f32>(0.0)), 1.0);
}
