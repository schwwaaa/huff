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
    scan_transform: vec4<f32>,
    scan_dimensions: vec4<f32>,
    smoosh_state: vec4<f32>,
    luma_state: vec4<f32>,
    global_mix_state: vec4<f32>,
    flow_state0: vec4<f32>,
    flow_state1: vec4<f32>,
    flow_state2: vec4<f32>,
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

struct ScanBand {
    dest_rect: vec4<f32>,
    source_rect: vec4<f32>,
    alpha_pad: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> gestures: GestureData;
@group(0) @binding(2) var<storage, read> signals: SignalData;
@group(0) @binding(3) var<storage, read> glitch_tiles: array<GlitchTile>;
@group(0) @binding(4) var<storage, read> scan_bands: array<ScanBand>;

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

// Isolated layer resources used only by the Smoosh pass.
@group(2) @binding(7) var smoosh_previous: texture_2d<f32>;
@group(2) @binding(8) var smoosh_glitch_layer: texture_2d<f32>;
@group(2) @binding(9) var smoosh_scan_layer: texture_2d<f32>;
@group(2) @binding(10) var smoosh_sampler: sampler;

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

struct ScanVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) alpha: f32,
};

@vertex
fn vs_scan(
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance_index: u32,
) -> ScanVertexOutput {
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 1.0),
    );
    let band = scan_bands[instance_index];
    let corner = corners[vertex_index];
    let render_size = max(u.resolution_time.xy, vec2<f32>(1.0));
    let local_pixel = band.dest_rect.xy + corner * band.dest_rect.zw;

    // Canvas2D order: translate to screen center, rotate, pattern-scale, then
    // draw in a coordinate system whose Y origin is -rotatedSpan/2.
    let local_centered = local_pixel - vec2<f32>(render_size.x * 0.5, u.scan_dimensions.x * 0.5);
    let scaled = local_centered * max(u.scan_transform.y, 0.0001);
    let cosine = cos(u.scan_transform.x);
    let sine = sin(u.scan_transform.x);
    let rotated = vec2<f32>(
        scaled.x * cosine - scaled.y * sine,
        scaled.x * sine + scaled.y * cosine
    );
    let destination = rotated + render_size * 0.5 + u.scan_transform.zw;

    var output: ScanVertexOutput;
    output.position = vec4<f32>(
        destination.x / render_size.x * 2.0 - 1.0,
        1.0 - destination.y / render_size.y * 2.0,
        0.0,
        1.0
    );
    output.uv = band.source_rect.xy + corner * band.source_rect.zw;
    output.alpha = band.alpha_pad.x;
    return output;
}

@fragment
fn fs_scan(input: ScanVertexOutput) -> @location(0) vec4<f32> {
    // Canvas drawImage clips source rectangles outside the source canvas. Do
    // not clamp and smear edge pixels when a rotated span extends past it.
    if (any(input.uv < vec2<f32>(0.0)) || any(input.uv > vec2<f32>(1.0))) {
        return vec4<f32>(0.0);
    }
    let color = textureSample(clean_composite, effect_sampler, input.uv).rgb;
    return vec4<f32>(color, clamp(input.alpha, 0.0, 1.0));
}

// Emulates the beginning of the original draw loop. With no active effects the
// persistent buffer is refreshed from the clean source. Otherwise, destination-
// out persistence fades the existing premultiplied RGBA buffer very slightly.
@fragment
fn fs_effect_prepare(input: VertexOutput) -> @location(0) vec4<f32> {
    let any_effect = u.history_controls.x > 0.5 || u.controls0.y > 0.0 || u.effect_state.y > 0.5 || u.smoosh_state.x > 0.5 || u.luma_state.x > 0.5 || u.global_mix_state.x > 0.5 || u.flow_state0.x > 0.5;
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



fn safe_unpremultiply(value: vec4<f32>) -> vec3<f32> {
    if (value.a <= 0.00001) {
        return vec3<f32>(0.0);
    }
    return value.rgb / value.a;
}

fn color_luma(value: vec3<f32>) -> f32 {
    return dot(value, vec3<f32>(0.299, 0.587, 0.114));
}

fn color_sat(value: vec3<f32>) -> f32 {
    return max(value.r, max(value.g, value.b)) - min(value.r, min(value.g, value.b));
}

fn clip_color(value_in: vec3<f32>) -> vec3<f32> {
    var value = value_in;
    let lum = color_luma(value);
    let min_value = min(value.r, min(value.g, value.b));
    let max_value = max(value.r, max(value.g, value.b));
    if (min_value < 0.0) {
        value = vec3<f32>(lum) + (value - vec3<f32>(lum)) * (lum / max(lum - min_value, 0.00001));
    }
    if (max_value > 1.0) {
        value = vec3<f32>(lum) + (value - vec3<f32>(lum)) * ((1.0 - lum) / max(max_value - lum, 0.00001));
    }
    return clamp(value, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn set_luma(value: vec3<f32>, target_luma: f32) -> vec3<f32> {
    return clip_color(value + vec3<f32>(target_luma - color_luma(value)));
}

fn set_saturation(value: vec3<f32>, target_sat: f32) -> vec3<f32> {
    let min_value = min(value.r, min(value.g, value.b));
    let max_value = max(value.r, max(value.g, value.b));
    if (max_value - min_value <= 0.00001) {
        return vec3<f32>(0.0);
    }
    return (value - vec3<f32>(min_value)) * (target_sat / (max_value - min_value));
}

fn soft_light_channel(base: f32, source: f32) -> f32 {
    if (source <= 0.5) {
        return base - (1.0 - 2.0 * source) * base * (1.0 - base);
    }
    let d = select(sqrt(max(base, 0.0)), ((16.0 * base - 12.0) * base + 4.0) * base, base <= 0.25);
    return base + (2.0 * source - 1.0) * (d - base);
}

fn blend_rgb(base: vec3<f32>, source: vec3<f32>, mode_value: f32) -> vec3<f32> {
    let mode = u32(mode_value + 0.5);
    if (mode == 0u) { return 1.0 - (1.0 - base) * (1.0 - source); } // screen
    if (mode == 1u) { return min(base + source, vec3<f32>(1.0)); } // lighter
    if (mode == 2u) { return max(base, source); }
    if (mode == 3u) { return min(base / max(vec3<f32>(1.0) - source, vec3<f32>(0.0001)), vec3<f32>(1.0)); }
    if (mode == 4u) { return base * source; }
    if (mode == 5u) { return min(base, source); }
    if (mode == 6u) { return 1.0 - min((1.0 - base) / max(source, vec3<f32>(0.0001)), vec3<f32>(1.0)); }
    if (mode == 7u) {
        return select(1.0 - 2.0 * (1.0 - base) * (1.0 - source), 2.0 * base * source, base <= vec3<f32>(0.5));
    }
    if (mode == 8u) {
        return vec3<f32>(
            soft_light_channel(base.r, source.r),
            soft_light_channel(base.g, source.g),
            soft_light_channel(base.b, source.b)
        );
    }
    if (mode == 9u) {
        return select(1.0 - 2.0 * (1.0 - base) * (1.0 - source), 2.0 * base * source, source <= vec3<f32>(0.5));
    }
    if (mode == 10u) { return abs(base - source); }
    if (mode == 11u) { return base + source - 2.0 * base * source; }
    if (mode == 12u) { return set_luma(set_saturation(source, color_sat(base)), color_luma(base)); }
    if (mode == 13u) { return set_luma(set_saturation(base, color_sat(source)), color_luma(base)); }
    if (mode == 14u) { return set_luma(source, color_luma(base)); }
    if (mode == 15u) { return set_luma(base, color_luma(source)); }
    return source; // source-over / normal
}

fn source_over(destination: vec4<f32>, source_rgb: vec3<f32>, source_alpha: f32) -> vec4<f32> {
    let alpha_value = clamp(source_alpha, 0.0, 1.0);
    return vec4<f32>(source_rgb * alpha_value + destination.rgb * (1.0 - alpha_value), alpha_value + destination.a * (1.0 - alpha_value));
}

@fragment
fn fs_smoosh(input: VertexOutput) -> @location(0) vec4<f32> {
    let previous = textureSample(smoosh_previous, smoosh_sampler, input.uv);
    let glitch_layer_value = textureSample(smoosh_glitch_layer, smoosh_sampler, input.uv);
    let scan_layer_value = textureSample(smoosh_scan_layer, smoosh_sampler, input.uv);
    let invert_layers = u.smoosh_state.z > 0.5;
    var base_layer = glitch_layer_value;
    var over_layer = scan_layer_value;
    if (invert_layers) {
        base_layer = scan_layer_value;
        over_layer = glitch_layer_value;
    }

    var destination = source_over(previous, safe_unpremultiply(base_layer), base_layer.a);
    let over_alpha = over_layer.a * clamp(u.smoosh_state.y, 0.0, 1.0);
    let destination_straight = safe_unpremultiply(destination);
    let over_straight = safe_unpremultiply(over_layer);
    let blended = blend_rgb(destination_straight, over_straight, u.smoosh_state.w);
    destination = source_over(destination, blended, over_alpha);
    return destination;
}

@fragment
fn fs_luma_key(input: VertexOutput) -> @location(0) vec4<f32> {
    let effect_value = textureSample(previous_effect, effect_sampler, input.uv);
    if (u.luma_state.x < 0.5 || u.luma_state.z <= 0.0) {
        return effect_value;
    }
    let clean_value = textureSample(clean_composite, effect_sampler, input.uv);
    let threshold_start = 1.0 - clamp(u.luma_state.y, 0.0, 1.0);
    var reveal = smoothstep(threshold_start, threshold_start + 64.0 / 255.0, color_luma(clean_value.rgb));
    if (u.luma_state.w > 0.5) {
        reveal = 1.0 - reveal;
    }
    let clean_alpha = (1.0 - reveal) * clamp(u.luma_state.z, 0.0, 1.0);
    return source_over(effect_value, clean_value.rgb, clean_alpha);
}

@fragment
fn fs_global_mix(input: VertexOutput) -> @location(0) vec4<f32> {
    let effect_value = textureSample(previous_effect, effect_sampler, input.uv);
    if (u.global_mix_state.x < 0.5 || u.global_mix_state.y <= 0.0) {
        return effect_value;
    }
    let clean_value = textureSample(clean_composite, effect_sampler, input.uv);
    let base_straight = safe_unpremultiply(effect_value);
    let blended = blend_rgb(base_straight, clean_value.rgb, u.global_mix_state.z);
    return source_over(effect_value, blended, clamp(u.global_mix_state.y, 0.0, 1.0));
}

fn hash21(value: vec2<f32>) -> f32 {
    let point = fract(value * vec2<f32>(123.34, 456.21));
    return fract((point.x + point.y) * (point.x + point.y + 45.32));
}

fn value_noise(value: vec2<f32>) -> f32 {
    let cell = floor(value);
    let fraction = fract(value);
    let curve = fraction * fraction * (3.0 - 2.0 * fraction);
    let a = hash21(cell);
    let b = hash21(cell + vec2<f32>(1.0, 0.0));
    let c = hash21(cell + vec2<f32>(0.0, 1.0));
    let d = hash21(cell + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

@fragment
fn fs_flow(input: VertexOutput) -> @location(0) vec4<f32> {
    let render_size = max(u.resolution_time.xy, vec2<f32>(1.0));
    let cell_size = max(u.flow_state0.z, 8.0);
    let pixel_position = input.uv * render_size;
    let cell_center = floor(pixel_position / cell_size) * cell_size + vec2<f32>(cell_size * 0.5);
    let normalized_center = cell_center / render_size * 2.0;
    let spread_frequency = 0.9 * max(u.flow_state2.x, 0.05);
    let flow_time = u.flow_state2.w * 0.005 * pow(max(u.flow_state0.w, 0.0), 1.6);
    var angle_value = value_noise(vec2<f32>(normalized_center.x * spread_frequency + flow_time, normalized_center.y * spread_frequency)) * 12.5663706;
    if (u.flow_state1.w > 0.0) {
        let second_angle = value_noise(vec2<f32>(normalized_center.x * spread_frequency * 4.0 + flow_time * 1.3 + 100.0, normalized_center.y * spread_frequency * 4.0 + flow_time * 0.9)) * 12.5663706;
        angle_value = mix(angle_value, second_angle, clamp(u.flow_state1.w * 0.5, 0.0, 0.5));
    }
    var displacement = vec2<f32>(cos(angle_value), sin(angle_value)) * u.flow_state0.y;
    let center_vector = render_size * 0.5 - cell_center;
    let center_length = max(length(center_vector), 1.0);
    displacement += center_vector / center_length * u.flow_state0.y * u.flow_state1.y;
    if (u.flow_state1.z != 0.0) {
        let radial_angle = atan2(cell_center.y - render_size.y * 0.5, cell_center.x - render_size.x * 0.5) * u.flow_state1.z;
        let cosine = cos(radial_angle);
        let sine = sin(radial_angle);
        displacement = vec2<f32>(displacement.x * cosine - displacement.y * sine, displacement.x * sine + displacement.y * cosine);
    }
    // Approximate the original leaky field integration without a CPU readback.
    // CARRY=0 is identical to one-pass displacement; higher values approach the
    // same accumulated steady-state magnitude while remaining bounded.
    let carry_gain = min(1.0 / max(1.0 - min(u.flow_state2.y * 0.96, 0.94), 0.06), 16.0);
    displacement *= carry_gain;
    let source_uv = clamp((pixel_position + displacement) / render_size, vec2<f32>(0.0), vec2<f32>(1.0));
    if (u.flow_state1.x >= 0.0) {
        return textureSample(temporal_history, temporal_history_sampler, source_uv, i32(round(u.flow_state1.x)));
    }
    return textureSample(previous_effect, effect_sampler, source_uv);
}

fn compose_final_color(uv: vec2<f32>) -> vec3<f32> {
    let clean = textureSample(clean_source, final_sampler, uv).rgb;
    let any_effect = u.history_controls.x > 0.5
        || u.controls0.y > 0.0
        || u.effect_state.y > 0.5
        || u.smoosh_state.x > 0.5
        || u.luma_state.x > 0.5
        || u.global_mix_state.x > 0.5
        || u.flow_state0.x > 0.5;
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
    return max(color, vec3<f32>(0.0));
}

// Authoritative render-resolution output. Syphon, Spout, recording and export
// consume this texture, so external output is independent of window dimensions.
@fragment
fn fs_output(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(compose_final_color(input.uv), 1.0);
}

// Window presentation only. The authoritative RGBA8 output is sampled and
// letterboxed to the current native surface without changing external output.
@fragment
fn fs_surface(input: VertexOutput) -> @location(0) vec4<f32> {
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
    return vec4<f32>(textureSample(final_effect, final_sampler, uv).rgb, 1.0);
}
