// spout_bridge.cpp
// C-ABI bridge wrapping SpoutDX for huff.
//
// Uses SpoutDX::SendImage which calls D3D11 UpdateSubresource internally.
// No OpenGL context needed. SpoutDX creates its own ID3D11Device.
//
// The shared D3D11 texture is what Spout receivers grab — zero extra copy
// on the receiver side (DXGI shared handle).

#include "spout_bridge.h"

#include <memory>
#include <mutex>
#include <string>

// SpoutDX includes (uses ../../SpoutGL path prefix from CMakeLists)
#include "SpoutDX.h"

static std::mutex              g_mutex;
static std::unique_ptr<spoutDX> g_sender;
static std::string             g_name;
static unsigned int            g_width  = 0;
static unsigned int            g_height = 0;

extern "C" {

int spoutdx_init_sender(const char* name, int width, int height) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);

        const char* n = (name && *name) ? name : "huff";

        // Tear down existing sender if name or size changed
        if (g_sender) {
            g_sender->ReleaseSender();
            g_sender.reset();
        }

        g_sender = std::make_unique<spoutDX>();

        // Let SpoutDX create its own D3D11 device
        if (!g_sender->OpenDirectX11()) {
            g_sender.reset();
            return 0;
        }

        g_sender->SetSenderName(n);
        // DXGI_FORMAT_R8G8B8A8_UNORM = 28
        g_sender->SetSenderFormat((DXGI_FORMAT)28);

        g_name   = n;
        g_width  = (unsigned int)width;
        g_height = (unsigned int)height;

        return 1;
    } catch (...) { return 0; }
}

int spoutdx_send_image(const uint8_t* pixels, int width, int height) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_sender || !pixels) return 0;

        return g_sender->SendImage(
            reinterpret_cast<const unsigned char*>(pixels),
            (unsigned int)width,
            (unsigned int)height
        ) ? 1 : 0;

    } catch (...) { return 0; }
}

int spoutdx_get_adapter_index() {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_sender) return -1;
        return g_sender->GetAdapter();
    } catch (...) { return -1; }
}

int spoutdx_get_adapter_count() {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_sender) return 0;
        return g_sender->GetNumAdapters();
    } catch (...) { return 0; }
}

int spoutdx_get_adapter_name(char* buffer, int maxchars) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_sender || !buffer || maxchars <= 0) return 0;
        const int index = g_sender->GetAdapter();
        if (index < 0) return 0;
        buffer[0] = '\0';
        return g_sender->GetAdapterName(index, buffer, maxchars) ? 1 : 0;
    } catch (...) { return 0; }
}

double spoutdx_get_sender_fps() {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_sender) return 0.0;
        return g_sender->GetSenderFps();
    } catch (...) { return 0.0; }
}

void spoutdx_shutdown() {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (g_sender) {
            g_sender->ReleaseSender();
            g_sender->CloseDirectX11();
            g_sender.reset();
        }
        g_name.clear();
        g_width = g_height = 0;
    } catch (...) {}
}

} // extern "C"
