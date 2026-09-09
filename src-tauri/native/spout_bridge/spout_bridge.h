#pragma once
#include <stdint.h>

#ifdef _WIN32
  #define SPOUT_BRIDGE_API __declspec(dllexport)
#else
  #define SPOUT_BRIDGE_API
#endif

extern "C" {

// Initialize a SpoutDX sender (D3D11 path — no GL context required).
// Returns 1 on success, 0 on failure.
SPOUT_BRIDGE_API int  spoutdx_init_sender(const char* name, int width, int height);

// Send raw RGBA pixel bytes via SpoutDX::SendImage (UpdateSubresource path).
// pixels: width * height * 4 bytes, RGBA order.
// Returns 1 on success, 0 on failure.
SPOUT_BRIDGE_API int  spoutdx_send_image(const uint8_t* pixels, int width, int height);

// Diagnostics only. These calls do not change the selected adapter.
SPOUT_BRIDGE_API int    spoutdx_get_adapter_index();
SPOUT_BRIDGE_API int    spoutdx_get_adapter_count();
SPOUT_BRIDGE_API int    spoutdx_get_adapter_name(char* buffer, int maxchars);
SPOUT_BRIDGE_API double spoutdx_get_sender_fps();

// Release sender and D3D11 device.
SPOUT_BRIDGE_API void spoutdx_shutdown();

} // extern "C"
