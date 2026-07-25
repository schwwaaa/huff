#pragma once
#include <stdint.h>

#ifdef _WIN32
  #define SPOUT_BRIDGE_API
#else
  #define SPOUT_BRIDGE_API
#endif

extern "C" {

// Return the number of DXGI graphics adapters visible to SpoutDX.
SPOUT_BRIDGE_API int spoutdx_get_adapter_count();

// Copy an adapter name into `buffer`. Returns 1 on success.
SPOUT_BRIDGE_API int spoutdx_get_adapter_name(int index, char* buffer, int buffer_len);

// Initialize a SpoutDX sender. adapter_index < 0 selects the system default.
// All sender calls are expected to occur on one owning thread.
SPOUT_BRIDGE_API int spoutdx_init_sender(
    const char* name,
    int width,
    int height,
    int adapter_index
);

// Send dense RGBA8 pixels. `pitch` is bytes per row; pass width * 4 for dense data.
SPOUT_BRIDGE_API int spoutdx_send_image(
    const uint8_t* pixels,
    int width,
    int height,
    int pitch
);

// Query the sender's resolved name and adapter after initialization.
SPOUT_BRIDGE_API int spoutdx_get_sender_name(char* buffer, int buffer_len);
SPOUT_BRIDGE_API int spoutdx_get_active_adapter();
SPOUT_BRIDGE_API int spoutdx_get_active_adapter_name(char* buffer, int buffer_len);
SPOUT_BRIDGE_API double spoutdx_get_sender_fps();
SPOUT_BRIDGE_API int64_t spoutdx_get_sender_frame();
SPOUT_BRIDGE_API int spoutdx_is_initialized();

// Copy the most recent bridge error into `buffer`. Returns the copied byte count.
SPOUT_BRIDGE_API int spoutdx_get_last_error(char* buffer, int buffer_len);

// Release sender and D3D11 device.
SPOUT_BRIDGE_API void spoutdx_shutdown();

} // extern "C"
