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
    effect_state: vec4<f32>,
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

struct GlitchTile {
    dest_rect: vec4<f32>,
    source_rect: vec4<f32>,
    layer_alpha: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> gestures: GestureData;
@group(0) @binding(2) var<storage, read> signals: SignalData;
@group(0) @binding(3) var<storage, read> glitch_tiles: array<GlitchTile>;

@group(1) @binding(0) var camera_texture: texture_2d<f32>;
@group(1) @binding(1) var video_texture: texture_2d<f32>;
@group(1) @binding(2) var source_sampler: sampler;

// Group 2 is shared by the persistent effect-buffer passes and the history
// array, keeping Huff within the portable four-bind-group limit.
@group(2) @binding(0) var clean_composite: texture_2d<f32>;
@group(2) @binding(1) var previous_effect: texture_2d<f32>;
@group(2) @binding(2) var effect_sampler: sampler;
@group(2) @binding(3) var temporal_history: texture_2d_array<f32>;
@group(2) @binding(4) var temporal_history_sampler: sampler;
@group(2) @binding(5) var glitch_history: texture_2d_array<f32>;
@group(2) @binding(6) var glitch_history_sampler: sampler;

@group(3) @binding(0) var final_effect: texture_2d<f32>;
@group(3) @binding(1) var final_sampler: sampler;
@group(3) @binding(2) var clean_source: texture_2d<f32>;

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

fn source_available_for_selection() -> bool {
    let camera_available = u.source_state.x > 0.5;
    let video_available = u.source_state.y > 0.5;
    let selected_source = u32(u.controls0.w + 0.5);
    if (selected_source == 1u) {
        return video_available;
    }
    if (selected_source == 2u) {
        return camera_available;
    }
    if (selected_source == 0u) {
        return camera_available || video_available;
    }
    return false;
}

// Clean source only. Base Mix belongs to the final display composite in the
// original application; temporal history always captures the unprocessed frame.
@fragment
fn fs_composite(input: VertexOutput) -> @location(0) vec4<f32> {
    let camera_available = u.source_state.x > 0.5;
    let video_available = u.source_state.y > 0.5;
    let background = background_color(u.source_state.z);
    var source = background;
    let selected_source = u32(u.controls0.w + 0.5);
    if (selected_source == 1u) {
        if (video_available) {
            source = textureSample(video_texture, source_sampler, input.uv).rgb;
        }
    } else if (selected_source == 2u) {
        if (camera_available) {
            source = textureSample(camera_texture, source_sampler, input.uv).rgb;
        }
    } else if (selected_source == 0u) {
        if (camera_available) {
            source = textureSample(camera_texture, source_sampler, input.uv).rgb;
        } else if (video_available) {
            source = textureSample(video_texture, source_sampler, input.uv).rgb;
        }
    }
    return vec4<f32>(source, 1.0);
}

@fragment
fn fs_history_capture(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(textureSample(final_effect, final_sampler, input.uv).rgb, 1.0);
}

struct GlitchVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) layer_alpha: vec2<f32>,
};

@vertex
fn vs_glitch(
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance_index: u32,
) -> GlitchVertexOutput {
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 1.0),
    );
    let tile = glitch_tiles[instance_index];
    let corner = corners[vertex_index];
    let destination = tile.dest_rect.xy + corner * tile.dest_rect.zw;

    var output: GlitchVertexOutput;
    output.position = vec4<f32>(
        destination.x * 2.0 - 1.0,
        1.0 - destination.y * 2.0,
        0.0,
        1.0
    );
    output.uv = tile.source_rect.xy + corner * tile.source_rect.zw;
    output.layer_alpha = tile.layer_alpha.xy;
    return output;
}

@fragment
fn fs_glitch(input: GlitchVertexOutput) -> @location(0) vec4<f32> {
    let layer = max(i32(round(input.layer_alpha.x)), 0);
    let alpha = clamp(input.layer_alpha.y, 0.0, 1.0);
    let color = textureSample(glitch_history, glitch_history_sampler, input.uv, layer).rgb;
    return vec4<f32>(color, alpha);
}

// Emulates the beginning of the original draw loop. With no active effects the
// persistent buffer is refreshed from the clean source. Otherwise, destination-
// out persistence fades the existing premultiplied RGBA buffer very slightly.
@fragment
fn fs_effect_prepare(input: VertexOutput) -> @location(0) vec4<f32> {
    let any_effect = u.history_controls.x > 0.5 || u.controls0.y > 0.0;
    if (u.effect_state.x < 0.5 || !any_effect) {
        return textureSample(clean_composite, effect_sampler, input.uv);
    }

    let previous = textureSample(previous_effect, effect_sampler, input.uv);
    let persistence = u.controls0.z;
    var decay = 1.0;
    if (persistence < 1.0) {
        // Canvas code: destination-out alpha = map(1-p, 0,1, 1,20) / 255.
        let erase_alpha = (1.0 + 19.0 * (1.0 - persistence)) / 255.0;
        decay = 1.0 - erase_alpha;
    }
    return previous * decay;
}

// The original feedback stage snapshots the current gBuf, clears gBuf, then
// draws that one snapshot with transform and globalAlpha. It is intentionally
// NOT additive source + previous feedback.
@fragment
fn fs_feedback(input: VertexOutput) -> @location(0) vec4<f32> {
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
    let transformed_uv = rotated + vec2<f32>(0.5);
    if (any(transformed_uv < vec2<f32>(0.0)) || any(transformed_uv > vec2<f32>(1.0))) {
        return vec4<f32>(0.0);
    }
    let current_buffer = textureSample(previous_effect, effect_sampler, transformed_uv);
    return current_buffer * clamp(u.controls0.y, 0.0, 1.0);
}

@fragment
fn fs_present(input: VertexOutput) -> @location(0) vec4<f32> {
    let render_size = max(u.resolution_time.xy, vec2<f32>(1.0));
    let surface_size = max(u.controls1.zw, vec2<f32>(1.0));
    let render_aspect = render_size.x / render_size.y;
    let surface_aspect = surface_size.x / surface_size.y;
    var uv = input.uv;

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

    let clean = textureSample(clean_source, final_sampler, uv).rgb;
    let any_effect = u.history_controls.x > 0.5 || u.controls0.y > 0.0;
    var color = clean;
    if (any_effect) {
        let background = background_color(u.source_state.z);
        var base_layer = background;
        if (u.source_state.w > 0.5 && source_available_for_selection()) {
            base_layer = mix(background, clean, clamp(u.controls0.x, 0.0, 1.0));
        }
        // Effect targets are premultiplied through ALPHA_BLENDING and decay.
        let effect = textureSample(final_effect, final_sampler, uv);
        color = effect.rgb + base_layer * (1.0 - clamp(effect.a, 0.0, 1.0));
    }

    color = color * max(u.controls1.x, 0.0);
    color = (color - vec3<f32>(0.5)) * max(u.controls1.y, 0.0) + vec3<f32>(0.5);
    return vec4<f32>(max(color, vec3<f32>(0.0)), 1.0);
}
