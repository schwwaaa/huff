#import <AVFoundation/AVFoundation.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#include <float.h>
#import <stdatomic.h>

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef void (*JPFrameCallback)(
    const uint8_t *bytes,
    size_t length,
    uint32_t width,
    uint32_t height,
    size_t bytes_per_row,
    double presentation_seconds,
    void *context
);

static AVCaptureSession *g_session = nil;
static AVCaptureDeviceInput *g_input = nil;
static AVCaptureVideoDataOutput *g_output = nil;
static dispatch_queue_t g_capture_queue = nil;
static uint32_t g_selected_width = 0;
static uint32_t g_selected_height = 0;
static double g_selected_fps = 0.0;
static uint32_t g_selected_format_count = 0;
static _Atomic uint64_t g_dropped_frames = 0;

static NSArray<AVCaptureDevice *> *jp_video_devices(void) {
    // Use the modern discovery API on macOS. The external device type also
    // includes compatible USB, virtual, and Continuity Camera sources.
    AVCaptureDeviceDiscoverySession *discovery =
        [AVCaptureDeviceDiscoverySession
            discoverySessionWithDeviceTypes:@[
                AVCaptureDeviceTypeBuiltInWideAngleCamera,
                AVCaptureDeviceTypeExternal
            ]
            mediaType:AVMediaTypeVideo
            position:AVCaptureDevicePositionUnspecified];
    return discovery.devices;
}

static size_t jp_copy_string(NSString *value, char *buffer, size_t capacity) {
    if (value == nil) {
        if (buffer != NULL && capacity > 0) buffer[0] = '\0';
        return 0;
    }
    const char *utf8 = value.UTF8String;
    if (utf8 == NULL) {
        if (buffer != NULL && capacity > 0) buffer[0] = '\0';
        return 0;
    }
    size_t length = strlen(utf8);
    if (buffer != NULL && capacity > 0) {
        size_t copy_length = length < capacity - 1 ? length : capacity - 1;
        memcpy(buffer, utf8, copy_length);
        buffer[copy_length] = '\0';
    }
    return length;
}

static void jp_write_error(char *buffer, size_t capacity, NSString *message) {
    jp_copy_string(message ?: @"Unknown AVFoundation error", buffer, capacity);
}

@interface JPVideoDataDelegate : NSObject <AVCaptureVideoDataOutputSampleBufferDelegate>
@property(nonatomic, assign) JPFrameCallback callback;
@property(nonatomic, assign) void *context;
@end

@implementation JPVideoDataDelegate
- (void)captureOutput:(AVCaptureOutput *)output
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
       fromConnection:(AVCaptureConnection *)connection {
    (void)output;
    (void)connection;
    if (self.callback == NULL) return;

    CVImageBufferRef image_buffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (image_buffer == NULL) return;
    CVPixelBufferRef pixel_buffer = (CVPixelBufferRef)image_buffer;
    if (CVPixelBufferGetPixelFormatType(pixel_buffer) != kCVPixelFormatType_32BGRA) return;

    CVReturn lock_result = CVPixelBufferLockBaseAddress(pixel_buffer, kCVPixelBufferLock_ReadOnly);
    if (lock_result != kCVReturnSuccess) return;

    const uint8_t *base = (const uint8_t *)CVPixelBufferGetBaseAddress(pixel_buffer);
    const size_t bytes_per_row = CVPixelBufferGetBytesPerRow(pixel_buffer);
    const uint32_t width = (uint32_t)CVPixelBufferGetWidth(pixel_buffer);
    const uint32_t height = (uint32_t)CVPixelBufferGetHeight(pixel_buffer);
    const size_t length = bytes_per_row * (size_t)height;
    CMTime pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
    const double seconds = CMTIME_IS_NUMERIC(pts) ? CMTimeGetSeconds(pts) : 0.0;

    g_selected_width = width;
    g_selected_height = height;
    if (base != NULL) {
        self.callback(base, length, width, height, bytes_per_row, seconds, self.context);
    }
    CVPixelBufferUnlockBaseAddress(pixel_buffer, kCVPixelBufferLock_ReadOnly);
}

- (void)captureOutput:(AVCaptureOutput *)output
    didDropSampleBuffer:(CMSampleBufferRef)sampleBuffer
       fromConnection:(AVCaptureConnection *)connection {
    (void)output;
    (void)sampleBuffer;
    (void)connection;
    atomic_fetch_add_explicit(&g_dropped_frames, 1, memory_order_relaxed);
}
@end

static JPVideoDataDelegate *g_delegate = nil;

void jp_avf_request_access(void) {
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
    if (status == AVAuthorizationStatusNotDetermined) {
        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) {
            (void)granted;
        }];
    }
}

int32_t jp_avf_authorization_status(void) {
    return (int32_t)[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
}

size_t jp_avf_camera_count(void) {
    return jp_video_devices().count;
}

size_t jp_avf_camera_name(size_t index, char *buffer, size_t capacity) {
    NSArray<AVCaptureDevice *> *devices = jp_video_devices();
    if (index >= devices.count) return jp_copy_string(@"", buffer, capacity);
    return jp_copy_string(devices[index].localizedName, buffer, capacity);
}

size_t jp_avf_camera_unique_id(size_t index, char *buffer, size_t capacity) {
    NSArray<AVCaptureDevice *> *devices = jp_video_devices();
    if (index >= devices.count) return jp_copy_string(@"", buffer, capacity);
    return jp_copy_string(devices[index].uniqueID, buffer, capacity);
}

static double jp_max_fps_for_format(AVCaptureDeviceFormat *format) {
    double maximum = 0.0;
    for (AVFrameRateRange *range in format.videoSupportedFrameRateRanges) {
        maximum = fmax(maximum, range.maxFrameRate);
    }
    return maximum;
}

static BOOL jp_format_supports_fps(AVCaptureDeviceFormat *format, double fps) {
    for (AVFrameRateRange *range in format.videoSupportedFrameRateRanges) {
        if (fps >= range.minFrameRate - 0.01 && fps <= range.maxFrameRate + 0.01) return YES;
    }
    return NO;
}

static double jp_format_score(
    int32_t profile,
    uint32_t width,
    uint32_t height,
    double max_fps
) {
    const double pixels = (double)width * (double)height;
    if (profile == 2) {
        // Maximum delivered frame rate first, then prefer a smaller conversion surface.
        return -max_fps * 1000000000000.0 + pixels;
    }
    if (profile == 3) {
        // Maximum definition first, but heavily penalize modes below 24 FPS.
        const double slow_penalty = max_fps < 24.0 ? 1000000000000000.0 : 0.0;
        return slow_penalty - pixels * 1000.0 - fmin(max_fps, 60.0);
    }

    const double target_width = profile == 0 ? 640.0 : 1280.0;
    const double target_height = profile == 0 ? 480.0 : 720.0;
    const double resolution_error = fabs((double)width - target_width) / target_width
                                  + fabs((double)height - target_height) / target_height;
    const double fps_penalty = max_fps >= 30.0 ? 0.0 : (30.0 - max_fps) * 100.0;
    return resolution_error * 1000000.0 + fps_penalty * 1000000.0 - fmin(max_fps, 60.0);
}

static AVCaptureDeviceFormat *jp_choose_format(
    AVCaptureDevice *device,
    int32_t profile,
    double *selected_fps,
    uint32_t *selected_width,
    uint32_t *selected_height
) {
    AVCaptureDeviceFormat *best = nil;
    double best_score = DBL_MAX;
    double best_fps = 0.0;
    uint32_t best_width = 0;
    uint32_t best_height = 0;

    for (AVCaptureDeviceFormat *format in device.formats) {
        CMVideoDimensions dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription);
        if (dimensions.width <= 0 || dimensions.height <= 0) continue;
        const double max_fps = jp_max_fps_for_format(format);
        if (max_fps <= 0.0) continue;
        const double score = jp_format_score(
            profile,
            (uint32_t)dimensions.width,
            (uint32_t)dimensions.height,
            max_fps
        );
        if (score < best_score) {
            best = format;
            best_score = score;
            best_fps = profile == 2 ? fmin(max_fps, 60.0) : fmin(max_fps, 30.0);
            best_width = (uint32_t)dimensions.width;
            best_height = (uint32_t)dimensions.height;
        }
    }

    if (best != nil) {
        *selected_fps = best_fps;
        *selected_width = best_width;
        *selected_height = best_height;
    }
    return best;
}

void jp_avf_stop_camera(void) {
    AVCaptureSession *session = g_session;
    AVCaptureVideoDataOutput *output = g_output;
    if (output != nil) {
        [output setSampleBufferDelegate:nil queue:NULL];
    }
    if (session != nil && session.isRunning) {
        [session stopRunning];
    }
    g_delegate = nil;
    g_output = nil;
    g_input = nil;
    g_session = nil;
    g_capture_queue = nil;
    g_selected_width = 0;
    g_selected_height = 0;
    g_selected_fps = 0.0;
    g_selected_format_count = 0;
    atomic_store_explicit(&g_dropped_frames, 0, memory_order_relaxed);
}

int32_t jp_avf_start_camera(
    size_t index,
    int32_t profile,
    JPFrameCallback callback,
    void *context,
    char *error_buffer,
    size_t error_capacity
) {
    jp_avf_stop_camera();

    if ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo] != AVAuthorizationStatusAuthorized) {
        jp_write_error(error_buffer, error_capacity, @"AVFoundation camera permission is not authorized.");
        return 1;
    }

    NSArray<AVCaptureDevice *> *devices = jp_video_devices();
    if (index >= devices.count) {
        jp_write_error(error_buffer, error_capacity, @"The selected AVFoundation camera is no longer available.");
        return 2;
    }

    AVCaptureDevice *device = devices[index];
    double selected_fps = 0.0;
    uint32_t selected_width = 0;
    uint32_t selected_height = 0;
    AVCaptureDeviceFormat *selected_format = jp_choose_format(
        device,
        profile,
        &selected_fps,
        &selected_width,
        &selected_height
    );
    if (selected_format == nil) {
        jp_write_error(error_buffer, error_capacity, @"AVFoundation found no usable video formats for this camera.");
        return 3;
    }

    NSError *configuration_error = nil;
    if (![device lockForConfiguration:&configuration_error]) {
        jp_write_error(
            error_buffer,
            error_capacity,
            [NSString stringWithFormat:@"Could not configure %@: %@", device.localizedName, configuration_error.localizedDescription]
        );
        return 4;
    }
    device.activeFormat = selected_format;
    if (selected_fps > 0.0 && jp_format_supports_fps(selected_format, selected_fps)) {
        CMTime duration = CMTimeMake(1000, (int32_t)llround(selected_fps * 1000.0));
        device.activeVideoMinFrameDuration = duration;
        device.activeVideoMaxFrameDuration = duration;
    }
    [device unlockForConfiguration];

    NSError *input_error = nil;
    AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:device error:&input_error];
    if (input == nil) {
        jp_write_error(
            error_buffer,
            error_capacity,
            [NSString stringWithFormat:@"Could not create camera input for %@: %@", device.localizedName, input_error.localizedDescription]
        );
        return 5;
    }

    AVCaptureSession *session = [[AVCaptureSession alloc] init];
    [session beginConfiguration];
    // The input-priority session preset is unavailable on macOS. The capture
    // device has already been configured explicitly through activeFormat and
    // activeVideoMin/MaxFrameDuration, so no session preset is applied here.
    if (![session canAddInput:input]) {
        [session commitConfiguration];
        jp_write_error(error_buffer, error_capacity, @"AVFoundation could not add the selected camera input to the capture session.");
        return 6;
    }
    [session addInput:input];

    AVCaptureVideoDataOutput *output = [[AVCaptureVideoDataOutput alloc] init];
    output.videoSettings = @{
        (id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA)
    };
    output.alwaysDiscardsLateVideoFrames = YES;

    JPVideoDataDelegate *delegate = [[JPVideoDataDelegate alloc] init];
    delegate.callback = callback;
    delegate.context = context;
    dispatch_queue_t capture_queue = dispatch_queue_create(
        "com.schwwaaa.junkpile.avfoundation.frames",
        DISPATCH_QUEUE_SERIAL
    );
    [output setSampleBufferDelegate:delegate queue:capture_queue];

    if (![session canAddOutput:output]) {
        [output setSampleBufferDelegate:nil queue:NULL];
        [session commitConfiguration];
        jp_write_error(error_buffer, error_capacity, @"AVFoundation could not add BGRA video output to the capture session.");
        return 7;
    }
    [session addOutput:output];
    [session commitConfiguration];

    g_session = session;
    g_input = input;
    g_output = output;
    g_delegate = delegate;
    g_capture_queue = capture_queue;
    g_selected_width = selected_width;
    g_selected_height = selected_height;
    g_selected_fps = selected_fps;
    g_selected_format_count = (uint32_t)device.formats.count;
    atomic_store_explicit(&g_dropped_frames, 0, memory_order_relaxed);

    [session startRunning];
    if (!session.isRunning) {
        jp_avf_stop_camera();
        jp_write_error(error_buffer, error_capacity, @"AVFoundation created the capture session but it did not begin running.");
        return 8;
    }
    if (error_buffer != NULL && error_capacity > 0) error_buffer[0] = '\0';
    return 0;
}

uint32_t jp_avf_selected_width(void) {
    return g_selected_width;
}

uint32_t jp_avf_selected_height(void) {
    return g_selected_height;
}

double jp_avf_selected_fps(void) {
    return g_selected_fps;
}

uint32_t jp_avf_selected_format_count(void) {
    return g_selected_format_count;
}

uint64_t jp_avf_dropped_frames(void) {
    return atomic_load_explicit(&g_dropped_frames, memory_order_relaxed);
}
