// Static C-ABI bridge wrapping SpoutDX for Huff.
//
// The Rust Spout worker owns this bridge and invokes every function from the
// same thread. SpoutDX creates a D3D11 shared texture; Huff uploads the newest
// complete RGBA8 readback into that texture with SendImage.

#include "spout_bridge.h"

#include <algorithm>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>

#include <objbase.h>
#include "SpoutDX.h"

namespace {
std::mutex g_mutex;
std::unique_ptr<spoutDX> g_sender;
std::string g_requested_name = "huff";
std::string g_last_error;
unsigned int g_width = 0;
unsigned int g_height = 0;
int g_adapter_index = -1;
bool g_com_initialized = false;

void set_error(const std::string& message) {
    g_last_error = message;
}

int copy_string(const std::string& value, char* buffer, int buffer_len) {
    if (!buffer || buffer_len <= 0) return 0;
    const int count = std::min<int>(static_cast<int>(value.size()), buffer_len - 1);
    if (count > 0) std::memcpy(buffer, value.data(), static_cast<size_t>(count));
    buffer[count] = '\0';
    return count;
}

std::string adapter_name_for(spoutDX& probe, int index) {
    char name[512]{};
    if (index >= 0 && probe.GetAdapterName(index, name, static_cast<int>(sizeof(name)))) {
        return std::string(name);
    }
    return {};
}

void shutdown_unlocked() {
    if (g_sender) {
        g_sender->ReleaseSender();
        g_sender->CloseDirectX11();
        g_sender.reset();
    }
    g_width = 0;
    g_height = 0;
    g_adapter_index = -1;
    if (g_com_initialized) {
        CoUninitialize();
        g_com_initialized = false;
    }
}
} // namespace

extern "C" {

int spoutdx_get_adapter_count() {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        spoutDX probe;
        return std::max(0, probe.GetNumAdapters());
    } catch (...) {
        return 0;
    }
}

int spoutdx_get_adapter_name(int index, char* buffer, int buffer_len) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        spoutDX probe;
        const std::string name = adapter_name_for(probe, index);
        if (name.empty()) return 0;
        copy_string(name, buffer, buffer_len);
        return 1;
    } catch (...) {
        return 0;
    }
}

int spoutdx_init_sender(const char* name, int width, int height, int adapter_index) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        shutdown_unlocked();
        g_last_error.clear();

        if (width <= 0 || height <= 0 || width > 8192 || height > 8192) {
            set_error("invalid sender dimensions");
            return 0;
        }

        const HRESULT com_result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        if (SUCCEEDED(com_result)) {
            g_com_initialized = true;
        } else if (com_result != RPC_E_CHANGED_MODE) {
            set_error("CoInitializeEx failed");
            return 0;
        }

        g_sender = std::make_unique<spoutDX>();
        if (adapter_index >= 0 && !g_sender->SetAdapter(adapter_index)) {
            set_error("requested DirectX adapter is unavailable");
            shutdown_unlocked();
            return 0;
        }

        if (!g_sender->OpenDirectX11()
            || !g_sender->GetDX11Device()
            || !g_sender->GetDX11Context()) {
            set_error("could not create the SpoutDX D3D11 device");
            shutdown_unlocked();
            return 0;
        }

        const char* resolved = (name && *name) ? name : "huff";
        if (!g_sender->SetSenderName(resolved)) {
            set_error("could not reserve the Spout sender name");
            shutdown_unlocked();
            return 0;
        }

        // Huff's authoritative output readback is dense RGBA8.
        g_sender->SetSenderFormat(DXGI_FORMAT_R8G8B8A8_UNORM);
        g_requested_name = resolved;
        g_width = static_cast<unsigned int>(width);
        g_height = static_cast<unsigned int>(height);
        g_adapter_index = g_sender->GetAdapter();
        return 1;
    } catch (...) {
        std::lock_guard<std::mutex> lock(g_mutex);
        set_error("unexpected exception while initializing SpoutDX");
        shutdown_unlocked();
        return 0;
    }
}

int spoutdx_send_image(const uint8_t* pixels, int width, int height, int pitch) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_sender || !pixels) {
            set_error("Spout sender is not initialized");
            return 0;
        }
        if (width <= 0 || height <= 0
            || static_cast<unsigned int>(width) != g_width
            || static_cast<unsigned int>(height) != g_height) {
            set_error("frame dimensions do not match the active Spout sender");
            return 0;
        }
        const int minimum_pitch = width * 4;
        if (pitch < minimum_pitch) {
            set_error("frame row pitch is too small");
            return 0;
        }

        if (!g_sender->SendImage(
                reinterpret_cast<const unsigned char*>(pixels),
                static_cast<unsigned int>(width),
                static_cast<unsigned int>(height),
                static_cast<unsigned int>(pitch))) {
            set_error("SpoutDX SendImage failed");
            return 0;
        }
        g_last_error.clear();
        return 1;
    } catch (...) {
        std::lock_guard<std::mutex> lock(g_mutex);
        set_error("unexpected exception while publishing a Spout frame");
        return 0;
    }
}

int spoutdx_get_sender_name(char* buffer, int buffer_len) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        std::string name = g_requested_name;
        if (g_sender && g_sender->GetName() && *g_sender->GetName()) {
            name = g_sender->GetName();
        }
        return copy_string(name, buffer, buffer_len);
    } catch (...) {
        return 0;
    }
}

int spoutdx_get_active_adapter() {
    std::lock_guard<std::mutex> lock(g_mutex);
    return g_sender ? g_sender->GetAdapter() : g_adapter_index;
}

int spoutdx_get_active_adapter_name(char* buffer, int buffer_len) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_sender) return 0;
        const std::string name = adapter_name_for(*g_sender, g_sender->GetAdapter());
        return copy_string(name, buffer, buffer_len);
    } catch (...) {
        return 0;
    }
}

double spoutdx_get_sender_fps() {
    std::lock_guard<std::mutex> lock(g_mutex);
    return g_sender ? g_sender->GetFps() : 0.0;
}

int64_t spoutdx_get_sender_frame() {
    std::lock_guard<std::mutex> lock(g_mutex);
    return g_sender ? static_cast<int64_t>(g_sender->GetFrame()) : 0;
}

int spoutdx_is_initialized() {
    std::lock_guard<std::mutex> lock(g_mutex);
    return (g_sender && g_sender->IsInitialized()) ? 1 : 0;
}

int spoutdx_get_last_error(char* buffer, int buffer_len) {
    std::lock_guard<std::mutex> lock(g_mutex);
    return copy_string(g_last_error, buffer, buffer_len);
}

void spoutdx_shutdown() {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        shutdown_unlocked();
        g_last_error.clear();
    } catch (...) {}
}

} // extern "C"
