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

# One static library is linked directly into the Rust executable. This avoids a
# separately deployed spout_bridge.dll and makes dev, target-triple builds,
# MSI, and NSIS packaging follow the same runtime path.
add_library(spout_bridge STATIC
  spout_bridge.cpp
  spout_bridge.h
  "${SPOUTGL_DIR}/SpoutCopy.cpp"
  "${SPOUTGL_DIR}/SpoutDirectX.cpp"
  "${SPOUTGL_DIR}/SpoutFrameCount.cpp"
  "${SPOUTGL_DIR}/SpoutSenderNames.cpp"
  "${SPOUTGL_DIR}/SpoutSharedMemory.cpp"
  "${SPOUTGL_DIR}/SpoutUtils.cpp"
  "${SPOUTDX_DIR}/SpoutDX.cpp"
)

set_target_properties(spout_bridge PROPERTIES OUTPUT_NAME "spout_bridge")

target_include_directories(spout_bridge PRIVATE
  "${SPOUTGL_DIR}"
  "${SPOUTDX_DIR}"
  "${SPOUTLIB_DIR}"
  "${SPOUTSDK_DIR}"
)

if(MSVC)
  target_compile_definitions(spout_bridge PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX SPOUT_BUILD_STATIC)
  target_compile_options(spout_bridge PRIVATE /EHsc /W3)
  # Rust's MSVC target uses the release dynamic CRT even for debug builds.
  # Force /MD for every configuration to avoid /MDd RuntimeLibrary mismatches.
  set_property(TARGET spout_bridge PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
endif()
