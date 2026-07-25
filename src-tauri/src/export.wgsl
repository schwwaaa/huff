struct ExportUniforms {
    source_size: vec2<f32>,
    target_size: vec2<f32>,
    fit_mode: vec4<f32>,
};

@group(0) @binding(0) var<uniform> e: ExportUniforms;
@group(1) @binding(0) var export_source: texture_2d<f32>;
@group(1) @binding(1) var export_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_fullscreen(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var uvs = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0),
    );
    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv = uvs[vertex_index];
    return output;
}

@fragment
fn fs_export(input: VertexOutput) -> @location(0) vec4<f32> {
    let source_size = max(e.source_size, vec2<f32>(1.0));
    let target_size = max(e.target_size, vec2<f32>(1.0));
    let source_aspect = source_size.x / source_size.y;
    let target_aspect = target_size.x / target_size.y;
    var uv = input.uv;

    // 0 = fit/letterbox, 1 = crop/fill, 2 = stretch.
    if (e.fit_mode.x < 0.5) {
        if (target_aspect > source_aspect) {
            let visible_width = source_aspect / target_aspect;
            uv.x = (uv.x - 0.5) / visible_width + 0.5;
        } else {
            let visible_height = target_aspect / source_aspect;
            uv.y = (uv.y - 0.5) / visible_height + 0.5;
        }
        if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) {
            return vec4<f32>(0.0, 0.0, 0.0, 1.0);
        }
    } else if (e.fit_mode.x < 1.5) {
        if (target_aspect > source_aspect) {
            let crop_height = source_aspect / target_aspect;
            uv.y = (uv.y - 0.5) * crop_height + 0.5;
        } else {
            let crop_width = target_aspect / source_aspect;
            uv.x = (uv.x - 0.5) * crop_width + 0.5;
        }
    }

    return vec4<f32>(textureSample(export_source, export_sampler, uv).rgb, 1.0);
}
