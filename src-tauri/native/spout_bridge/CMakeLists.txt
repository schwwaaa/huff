cmake_minimum_required(VERSION 3.20)
project(spout_bridge LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED SPOUT2_DIR)
  message(FATAL_ERROR "SPOUT2_DIR not set. Pass -DSPOUT2_DIR=path/to/native/spout2")
endif()

file(TO_CMAKE_PATH "${SPOUT2_DIR}" SPOUT2_DIR_CMAKE)

set(SPOUTSDK_DIR  "${SPOUT2_DIR_CMAKE}/SPOUTSDK")
set(SPOUTGL_DIR   "${SPOUTSDK_DIR}/SpoutGL")
set(SPOUTLIB_DIR  "${SPOUTSDK_DIR}/SpoutLibrary")
set(SPOUTDX_DIR   "${SPOUTSDK_DIR}/SpoutDirectX/SpoutDX")

# ── SpoutGL sources (shared memory, frame counting, utils) ────────────────────
set(SPOUTGL_SOURCES
  "${SPOUTGL_DIR}/SpoutCopy.cpp"
  "${SPOUTGL_DIR}/SpoutDirectX.cpp"
  "${SPOUTGL_DIR}/SpoutFrameCount.cpp"
  "${SPOUTGL_DIR}/SpoutSenderNames.cpp"
  "${SPOUTGL_DIR}/SpoutSharedMemory.cpp"
  "${SPOUTGL_DIR}/SpoutUtils.cpp"
)

# ── SpoutDX source (D3D11 sender/receiver) ────────────────────────────────────
set(SPOUTDX_SOURCES
  "${SPOUTDX_DIR}/SpoutDX.cpp"
)

# ── Static library combining SpoutGL + SpoutDX ────────────────────────────────
add_library(spout_static STATIC
  ${SPOUTGL_SOURCES}
  ${SPOUTDX_SOURCES}
)

target_include_directories(spout_static PUBLIC
  "${SPOUTGL_DIR}"
  "${SPOUTDX_DIR}"
  "${SPOUTLIB_DIR}"
  "${SPOUTSDK_DIR}"
)

if(MSVC)
  target_compile_definitions(spout_static PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
  target_compile_options(spout_static PRIVATE /EHsc)
endif()

target_link_libraries(spout_static PRIVATE
  dxgi
  d3d11
  user32
  gdi32
  winmm
  # opengl32 not needed for SpoutDX path
)

# ── C-ABI bridge DLL ──────────────────────────────────────────────────────────
add_library(spout_bridge SHARED
  spout_bridge.cpp
  spout_bridge.h
)

set_target_properties(spout_bridge PROPERTIES WINDOWS_EXPORT_ALL_SYMBOLS ON)
set_target_properties(spout_bridge PROPERTIES OUTPUT_NAME "spout_bridge")

target_include_directories(spout_bridge PRIVATE
  "${SPOUTGL_DIR}"
  "${SPOUTDX_DIR}"
  "${SPOUTLIB_DIR}"
  "${SPOUTSDK_DIR}"
)

if(MSVC)
  target_compile_definitions(spout_bridge PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
  target_compile_options(spout_bridge PRIVATE /EHsc)
endif()

target_link_libraries(spout_bridge PRIVATE
  spout_static
  dxgi
  d3d11
  user32
  gdi32
  winmm
)
