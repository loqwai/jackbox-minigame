// Territory render shader
// Draws fluid chunks with volume-based opacity and rounded cells

struct ViewUniforms {
  view_proj: mat4x4<f32>,
  viewport_size: vec2<f32>,
  cell_size: f32,
  time: f32,
}

struct ChunkUniforms {
  world_origin: vec2<f32>,
  chunk_size: f32,
  ghost_cells: f32,
}

// Color palette (8 player colors + empty)
const PALETTE = array<vec3<f32>, 9>(
  vec3<f32>(0.0, 0.0, 0.0),       // 0: empty/black
  vec3<f32>(1.0, 0.27, 0.27),     // 1: red
  vec3<f32>(1.0, 0.6, 0.2),       // 2: orange
  vec3<f32>(1.0, 0.9, 0.3),       // 3: yellow
  vec3<f32>(0.4, 0.9, 0.4),       // 4: green
  vec3<f32>(0.3, 0.7, 1.0),       // 5: blue
  vec3<f32>(0.6, 0.4, 0.9),       // 6: purple
  vec3<f32>(0.95, 0.5, 0.7),      // 7: pink
  vec3<f32>(0.5, 0.5, 0.5),       // 8: gray (fallback)
);

@group(0) @binding(0) var<uniform> view: ViewUniforms;
@group(0) @binding(1) var<uniform> chunk: ChunkUniforms;
@group(0) @binding(2) var chunk_tex: texture_2d<f32>;
@group(0) @binding(3) var chunk_sampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) world_pos: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOutput {
  // Full-screen quad for chunk (2 triangles)
  let positions = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 1.0),
  );

  let pos = positions[vid];
  let chunk_world_size = chunk.chunk_size * view.cell_size;

  var out: VertexOutput;
  out.uv = pos;
  out.world_pos = chunk.world_origin + pos * chunk_world_size;

  // Transform to clip space
  let world_pos_4 = vec4<f32>(out.world_pos, 0.0, 1.0);
  out.position = view.view_proj * world_pos_4;

  return out;
}

fn get_color(color_idx: u32) -> vec3<f32> {
  if (color_idx >= 9u) {
    return PALETTE[8];
  }
  return PALETTE[color_idx];
}

// Soft rounded rectangle SDF
fn rounded_box_sdf(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - b + vec2<f32>(r);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let tex_size = chunk.chunk_size + chunk.ghost_cells * 2.0;
  let ghost_offset = chunk.ghost_cells / tex_size;
  let inner_scale = chunk.chunk_size / tex_size;

  // Map UV to texture coordinates (skip ghost cells)
  let tex_uv = ghost_offset + in.uv * inner_scale;

  // Sample cell data
  let cell = textureSample(chunk_tex, chunk_sampler, tex_uv);
  let volume = cell.r;
  let source = cell.g;
  let pressure = cell.b;
  let color_idx = u32(floor(cell.a * 8.0 + 0.5));

  // Skip empty cells
  if (volume < 0.001) {
    discard;
  }

  // Get base color
  var color = get_color(color_idx);

  // Volume affects opacity (fuller = more opaque)
  let volume_ratio = clamp(volume, 0.0, 1.0);
  var alpha = 0.25 + volume_ratio * 0.55;

  // Source cells glow slightly
  if (source > 0.1) {
    color = mix(color, vec3<f32>(1.0), source * 0.15);
    alpha = min(0.9, alpha + source * 0.1);
  }

  // Pressure creates subtle pulsing
  if (pressure > 0.3) {
    let pulse = sin(view.time * 3.0 + in.world_pos.x * 0.1 + in.world_pos.y * 0.1) * 0.5 + 0.5;
    alpha = min(0.9, alpha + pressure * pulse * 0.1);
  }

  // Cell-level detail: rounded corners effect
  let cell_uv = fract(in.uv * chunk.chunk_size);
  let cell_center = cell_uv - vec2<f32>(0.5);

  // Size based on volume (fuller cells are bigger)
  let cell_size = 0.35 + volume_ratio * 0.15;
  let corner_radius = cell_size * 0.4;

  let sdf = rounded_box_sdf(cell_center, vec2<f32>(cell_size), corner_radius);

  // Soft edge
  let edge_softness = 0.05;
  let cell_alpha = 1.0 - smoothstep(-edge_softness, edge_softness, sdf);

  alpha *= cell_alpha;

  // Final color with premultiplied alpha
  return vec4<f32>(color * alpha, alpha);
}

// Variant for drawing borders between colors
@fragment
fn fs_border(in: VertexOutput) -> @location(0) vec4<f32> {
  let tex_size = chunk.chunk_size + chunk.ghost_cells * 2.0;
  let ghost_offset = chunk.ghost_cells / tex_size;
  let inner_scale = chunk.chunk_size / tex_size;
  let tex_uv = ghost_offset + in.uv * inner_scale;

  let cell = textureSample(chunk_tex, chunk_sampler, tex_uv);
  let color_idx = u32(floor(cell.a * 8.0 + 0.5));

  if (cell.r < 0.001) {
    discard;
  }

  // Sample neighbors to detect borders
  let texel_size = 1.0 / tex_size;
  let offsets = array<vec2<f32>, 4>(
    vec2<f32>(0.0, -texel_size),
    vec2<f32>(0.0, texel_size),
    vec2<f32>(-texel_size, 0.0),
    vec2<f32>(texel_size, 0.0),
  );

  var is_border = false;
  for (var i = 0u; i < 4u; i++) {
    let n = textureSample(chunk_tex, chunk_sampler, tex_uv + offsets[i]);
    let n_idx = u32(floor(n.a * 8.0 + 0.5));
    if (n.r > 0.001 && n_idx != color_idx) {
      is_border = true;
      break;
    }
  }

  if (!is_border) {
    discard;
  }

  let color = get_color(color_idx);
  return vec4<f32>(color, 0.8);
}
