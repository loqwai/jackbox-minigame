// Flow simulation compute shader
// Runs on each chunk, simulating Worldbox-style fluid dynamics
//
// Texture layout (rgba16float):
//   R = volume (0.0 - 2.0)
//   G = source strength (0.0 - 1.0, generates volume over time)
//   B = pressure (0.0 - 1.0, builds when blocked)
//   A = color index (0.0 - 1.0, maps to 8 colors: idx = floor(a * 8))

struct FluidParams {
  max_volume: f32,
  min_volume: f32,
  flow_rate: f32,
  surface_tension: f32,
  source_decay: f32,
  source_strength: f32,
  pressure_multiplier: f32,
  settle_threshold: f32,
  dt: f32,
  chunk_size: u32,
  ghost_cells: u32,
  _padding: u32,
}

@group(0) @binding(0) var input_tex: texture_storage_2d<rgba16float, read>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> params: FluidParams;

// Neighbor chunk textures for edge flow (may be null/empty)
@group(1) @binding(0) var neighbor_top: texture_storage_2d<rgba16float, read>;
@group(1) @binding(1) var neighbor_bottom: texture_storage_2d<rgba16float, read>;
@group(1) @binding(2) var neighbor_left: texture_storage_2d<rgba16float, read>;
@group(1) @binding(3) var neighbor_right: texture_storage_2d<rgba16float, read>;
@group(1) @binding(4) var<uniform> neighbor_flags: vec4<u32>; // 1 if neighbor exists

fn get_color_index(cell: vec4<f32>) -> u32 {
  return u32(floor(cell.a * 8.0));
}

fn colors_match(a: vec4<f32>, b: vec4<f32>) -> bool {
  return get_color_index(a) == get_color_index(b);
}

fn is_empty(cell: vec4<f32>) -> bool {
  return cell.r < params.min_volume;
}

fn sample_neighbor(coord: vec2<i32>, offset: vec2<i32>, size: i32) -> vec4<f32> {
  let nc = coord + offset;
  let ghost = i32(params.ghost_cells);

  // Check if within main chunk (including ghost border)
  if (nc.x >= 0 && nc.x < size && nc.y >= 0 && nc.y < size) {
    return textureLoad(input_tex, nc);
  }

  // Sample from neighbor chunks
  let inner_size = size - ghost * 2;

  // Top neighbor
  if (nc.y < 0 && neighbor_flags.x == 1u) {
    let sample_coord = vec2<i32>(nc.x, inner_size + nc.y + ghost);
    return textureLoad(neighbor_top, sample_coord);
  }

  // Bottom neighbor
  if (nc.y >= size && neighbor_flags.y == 1u) {
    let sample_coord = vec2<i32>(nc.x, nc.y - inner_size + ghost);
    return textureLoad(neighbor_bottom, sample_coord);
  }

  // Left neighbor
  if (nc.x < 0 && neighbor_flags.z == 1u) {
    let sample_coord = vec2<i32>(inner_size + nc.x + ghost, nc.y);
    return textureLoad(neighbor_left, sample_coord);
  }

  // Right neighbor
  if (nc.x >= size && neighbor_flags.w == 1u) {
    let sample_coord = vec2<i32>(nc.x - inner_size + ghost, nc.y);
    return textureLoad(neighbor_right, sample_coord);
  }

  // No neighbor - return empty
  return vec4<f32>(0.0);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let size = i32(params.chunk_size + params.ghost_cells * 2u);
  let coord = vec2<i32>(gid.xy);

  // Skip if outside texture bounds
  if (coord.x >= size || coord.y >= size) {
    return;
  }

  let cell = textureLoad(input_tex, coord);
  var volume = cell.r;
  var source = cell.g;
  var pressure = cell.b;
  let color_idx = cell.a;

  // Source generates volume over time
  if (source > params.min_volume) {
    volume += source * params.source_strength * params.dt;
    source *= params.source_decay;
  }

  // Skip empty cells
  if (volume < params.min_volume) {
    textureStore(output_tex, coord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Sample neighbors
  let neighbors = array<vec4<f32>, 4>(
    sample_neighbor(coord, vec2<i32>(0, -1), size),  // up
    sample_neighbor(coord, vec2<i32>(0, 1), size),   // down
    sample_neighbor(coord, vec2<i32>(-1, 0), size),  // left
    sample_neighbor(coord, vec2<i32>(1, 0), size)    // right
  );

  // Count blocked neighbors (enemy colors) and open neighbors
  var blocked_count = 0u;
  var open_count = 0u;
  var total_flow_out = 0.0;

  for (var i = 0u; i < 4u; i++) {
    let n = neighbors[i];
    if (!is_empty(n) && !colors_match(cell, n)) {
      blocked_count++;
    } else {
      open_count++;
    }
  }

  // Update pressure based on blocked neighbors
  if (blocked_count > 0u) {
    pressure = min(1.0, pressure + f32(blocked_count) * 0.1 * params.dt);
  } else {
    pressure *= 0.95;
  }

  // Calculate flow with pressure boost
  let pressure_boost = 1.0 + pressure * (params.pressure_multiplier - 1.0);
  let flow_per_neighbor = params.flow_rate * params.dt * pressure_boost / max(1.0, f32(open_count));

  // Flow to each open neighbor
  for (var i = 0u; i < 4u; i++) {
    let n = neighbors[i];

    // Skip enemy-occupied cells
    if (!is_empty(n) && !colors_match(cell, n)) {
      continue;
    }

    let n_volume = n.r;
    let diff = volume - n_volume;

    if (diff > params.surface_tension) {
      let to_flow = min(diff * 0.3 * pressure_boost, flow_per_neighbor);
      total_flow_out += to_flow;
    }
  }

  // Apply outflow (clamped to available volume)
  total_flow_out = min(total_flow_out, volume - params.min_volume);
  volume -= total_flow_out;

  // Receive inflow from neighbors
  for (var i = 0u; i < 4u; i++) {
    let n = neighbors[i];

    // Only receive from same color
    if (is_empty(n) || !colors_match(cell, n)) {
      continue;
    }

    let n_volume = n.r;
    let n_pressure = n.b;
    let diff = n_volume - volume;

    if (diff > params.surface_tension) {
      let n_pressure_boost = 1.0 + n_pressure * (params.pressure_multiplier - 1.0);
      let inflow = min(diff * 0.3 * n_pressure_boost, params.flow_rate * params.dt * n_pressure_boost * 0.25);
      volume += inflow;
    }
  }

  // Clamp volume
  volume = clamp(volume, 0.0, params.max_volume * (1.0 + 0.8)); // Allow compression

  textureStore(output_tex, coord, vec4<f32>(volume, source, pressure, color_idx));
}

// Separate kernel for adding ink from strokes (CPU -> GPU)
@compute @workgroup_size(64)
fn add_ink(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(num_workgroups) num_wg: vec3<u32>
) {
  // This would be called with stroke data buffer
  // For now, ink addition is handled separately
}
