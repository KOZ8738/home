#pragma once

#include "owned_view.hpp"
#include "view_resize.hpp"

namespace taxi_camera::native_camera {

// Output admission for opening a render gate.
//
// The renderer binds an active view's output through Material+520 -> Bitmap ->
// Bitmap+88 record -> record+16 wrapper -> wrapper+168 resource and does not
// null-check the record (retained RenderThreadProc faults read [record+0x10]
// with a null record). A ready camera chain (Node/Camera) says nothing about
// that output chain: pooled views keep the previous entry's material state,
// and the captured output routine may retain, replace or drop a Bitmap.
//
// A gate may therefore open only while the exact requested output is observed
// in the same inspection: mode2, the resource member present, the three view
// size pairs equal to the requested pane, and the Bitmap sized to that pane.
// This observes; it does not allocate, retain or prove GPU completion.
//
// The 19/09 22:27 and 23:22 reproductions crashed with all of that present.
// Their captured code shows the fault is a bound render target whose texture
// has no render-target record ([T+0x48]->[+8]->[0], else [T+0x40]) while a
// later slot has one. The diffuse texture's record is therefore required too.
inline bool owned_view_pane_output(const engine_camera::OwnedViewSnapshot& view, const ViewDimensions& requested) noexcept {
  return view.complete && view.ready && view.status == engine_camera::OwnedViewStatus::ready && view.mode == 2 && view.resource_present &&
         view.resource_address != 0 && view.dimensions == requested && view.output_dimensions == requested[0];
}
inline bool owned_view_render_target_ready(const engine_camera::OwnedViewSnapshot& view) noexcept {
  return view.output_slots[0].bitmap && view.output_slots[0].texture && view.output_slots[0].render_target_record;
}
inline bool owned_view_output_ready(const engine_camera::OwnedViewSnapshot& view, const ViewDimensions& requested) noexcept {
  return owned_view_pane_output(view, requested) && owned_view_render_target_ready(view);
}
// Retention-log digit per slot: 1 Bitmap, 2 texture, 4 render-target record.
inline std::uint32_t owned_view_slot_digits(const engine_camera::OwnedViewSnapshot& view) noexcept {
  return (view.output_slots[0].mask() << 8) | (view.output_slots[1].mask() << 4) | view.output_slots[2].mask();
}

}  // namespace taxi_camera::native_camera
