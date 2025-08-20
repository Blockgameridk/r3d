/*
 * Copyright (c) 2025 Le Juez Victor
 *
 * This software is provided "as-is", without any express or implied warranty. In no event
 * will the authors be held liable for any damages arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose, including commercial
 * applications, and to alter it and redistribute it freely, subject to the following restrictions:
 *
 *   1. The origin of this software must not be misrepresented; you must not claim that you
 *   wrote the original software. If you use this software in a product, an acknowledgment
 *   in the product documentation would be appreciated but is not required.
 *
 *   2. Altered source versions must be plainly marked as such, and must not be misrepresented
 *   as being the original software.
 *
 *   3. This notice may not be removed or altered from any source distribution.
 */

#include "./r3d_dds.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <glad.h>

/* === DDS Structures === */

typedef struct {
    uint32_t dwSize;
    uint32_t dwFlags;
    uint32_t dwFourCC;
    uint32_t dwRGBBitCount;
    uint32_t dwRBitMask;
    uint32_t dwGBitMask;
    uint32_t dwBBitMask;
    uint32_t dwABitMask;
} dds_pixelformat_t;

typedef struct {
    uint32_t dwSize;
    uint32_t dwFlags;
    uint32_t dwHeight;
    uint32_t dwWidth;
    uint32_t dwPitchOrLinearSize;
    uint32_t dwDepth;
    uint32_t dwMipMapCount;
    uint32_t dwReserved1[11];
    dds_pixelformat_t ddspf;
    uint32_t dwCaps;
    uint32_t dwCaps2;
    uint32_t dwCaps3;
    uint32_t dwCaps4;
    uint32_t dwReserved2;
} dds_header_t;

typedef struct {
    uint32_t dxgiFormat;
    uint32_t resourceDimension;
    uint32_t miscFlag;
    uint32_t arraySize;
    uint32_t miscFlags2;
} dds_header_dx10_t;

/* === Constants === */

#define DDS_MAGIC 0x20534444        // "DDS "
#define DDS_FOURCC 0x00000004
#define DDS_RGB 0x00000040
#define DDS_ALPHAPIXELS 0x00000001
#define FOURCC_DX10 0x30315844      // "DX10"

/* === DXGI Formats === */

#define DXGI_FORMAT_UNKNOWN 0
#define DXGI_FORMAT_R32G32B32A32_FLOAT 2
#define DXGI_FORMAT_R32G32B32_FLOAT 6
#define DXGI_FORMAT_R16G16B16A16_FLOAT 10
#define DXGI_FORMAT_R32G32_FLOAT 16
#define DXGI_FORMAT_R8G8B8A8_UNORM 28
#define DXGI_FORMAT_R16G16_FLOAT 34
#define DXGI_FORMAT_R32_FLOAT 41
#define DXGI_FORMAT_R8G8_UNORM 49
#define DXGI_FORMAT_R16_FLOAT 54
#define DXGI_FORMAT_R8_UNORM 61
#define DXGI_FORMAT_BC1_UNORM 71
#define DXGI_FORMAT_BC2_UNORM 74
#define DXGI_FORMAT_BC3_UNORM 77
#define DXGI_FORMAT_BC4_UNORM 80
#define DXGI_FORMAT_BC5_UNORM 83

/* === Helper Functions === */

static inline uint32_t get_bytes_per_pixel(r3d_dds_format_t format)
{
    switch (format) {
        case R3D_DDS_FORMAT_R8_UNORM: return 1;
        case R3D_DDS_FORMAT_R8G8_UNORM: return 2;
        case R3D_DDS_FORMAT_R8G8B8_UNORM: return 3;
        case R3D_DDS_FORMAT_R8G8B8A8_UNORM: return 4;
        case R3D_DDS_FORMAT_R16_FLOAT: return 2;
        case R3D_DDS_FORMAT_R32_FLOAT: return 4;
        case R3D_DDS_FORMAT_R16G16_FLOAT: return 4;
        case R3D_DDS_FORMAT_R32G32_FLOAT: return 8;
        case R3D_DDS_FORMAT_R16G16B16A16_FLOAT: return 8;
        case R3D_DDS_FORMAT_R32G32B32_FLOAT: return 12;
        case R3D_DDS_FORMAT_R32G32B32A32_FLOAT: return 16;
        default: return 0; // Compressed formats don't have simple BPP
    }
}

static inline r3d_dds_format_t dxgi_to_r3d_format(uint32_t dxgi_format)
{
    switch (dxgi_format) {
        case DXGI_FORMAT_R8_UNORM: return R3D_DDS_FORMAT_R8_UNORM;
        case DXGI_FORMAT_R8G8_UNORM: return R3D_DDS_FORMAT_R8G8_UNORM;
        case DXGI_FORMAT_R8G8B8A8_UNORM: return R3D_DDS_FORMAT_R8G8B8A8_UNORM;
        case DXGI_FORMAT_R16_FLOAT: return R3D_DDS_FORMAT_R16_FLOAT;
        case DXGI_FORMAT_R32_FLOAT: return R3D_DDS_FORMAT_R32_FLOAT;
        case DXGI_FORMAT_R16G16_FLOAT: return R3D_DDS_FORMAT_R16G16_FLOAT;
        case DXGI_FORMAT_R32G32_FLOAT: return R3D_DDS_FORMAT_R32G32_FLOAT;
        case DXGI_FORMAT_R16G16B16A16_FLOAT: return R3D_DDS_FORMAT_R16G16B16A16_FLOAT;
        case DXGI_FORMAT_R32G32B32_FLOAT: return R3D_DDS_FORMAT_R32G32B32_FLOAT;
        case DXGI_FORMAT_R32G32B32A32_FLOAT: return R3D_DDS_FORMAT_R32G32B32A32_FLOAT;
        case DXGI_FORMAT_BC1_UNORM: return R3D_DDS_FORMAT_BC1;
        case DXGI_FORMAT_BC2_UNORM: return R3D_DDS_FORMAT_BC2;
        case DXGI_FORMAT_BC3_UNORM: return R3D_DDS_FORMAT_BC3;
        case DXGI_FORMAT_BC4_UNORM: return R3D_DDS_FORMAT_BC4;
        case DXGI_FORMAT_BC5_UNORM: return R3D_DDS_FORMAT_BC5;
        default: return R3D_DDS_FORMAT_UNKNOWN;
    }
}

static inline r3d_dds_format_t legacy_format_to_r3d(const dds_pixelformat_t* pf)
{
    // Check for compressed formats first
    if (pf->dwFlags & DDS_FOURCC) {
        switch (pf->dwFourCC) {
            case 0x31545844: return R3D_DDS_FORMAT_BC1; // "DXT1"
            case 0x33545844: return R3D_DDS_FORMAT_BC2; // "DXT3"
            case 0x35545844: return R3D_DDS_FORMAT_BC3; // "DXT5"
            case 0x31495441: return R3D_DDS_FORMAT_BC4; // "ATI1"
            case 0x32495441: return R3D_DDS_FORMAT_BC5; // "ATI2"
        }
    }

    // Check for uncompressed formats
    if (pf->dwFlags & DDS_RGB) {
        switch (pf->dwRGBBitCount) {
            case 32:
                if (pf->dwABitMask != 0) return R3D_DDS_FORMAT_R8G8B8A8_UNORM;
                return R3D_DDS_FORMAT_R8G8B8_UNORM;
            case 24: return R3D_DDS_FORMAT_R8G8B8_UNORM;
            case 16: return R3D_DDS_FORMAT_R8G8_UNORM;
            case 8: return R3D_DDS_FORMAT_R8_UNORM;
        }
    }

    return R3D_DDS_FORMAT_UNKNOWN;
}

/* === OpenGL Format Mapping === */

static inline GLenum r3d_format_to_gl_internal_format(r3d_dds_format_t format)
{
    switch (format) {
        case R3D_DDS_FORMAT_R8_UNORM: return GL_R8;
        case R3D_DDS_FORMAT_R8G8_UNORM: return GL_RG8;
        case R3D_DDS_FORMAT_R8G8B8_UNORM: return GL_RGB8;
        case R3D_DDS_FORMAT_R8G8B8A8_UNORM: return GL_RGBA8;
        case R3D_DDS_FORMAT_R16_FLOAT: return GL_R16F;
        case R3D_DDS_FORMAT_R32_FLOAT: return GL_R32F;
        case R3D_DDS_FORMAT_R16G16_FLOAT: return GL_RG16F;
        case R3D_DDS_FORMAT_R32G32_FLOAT: return GL_RG32F;
        case R3D_DDS_FORMAT_R16G16B16A16_FLOAT: return GL_RGBA16F;
        case R3D_DDS_FORMAT_R32G32B32A32_FLOAT: return GL_RGBA32F;
        case R3D_DDS_FORMAT_BC1: return GL_COMPRESSED_RGBA_S3TC_DXT1_EXT;
        case R3D_DDS_FORMAT_BC2: return GL_COMPRESSED_RGBA_S3TC_DXT3_EXT;
        case R3D_DDS_FORMAT_BC3: return GL_COMPRESSED_RGBA_S3TC_DXT5_EXT;
        case R3D_DDS_FORMAT_BC4: return GL_COMPRESSED_RED_RGTC1;
        case R3D_DDS_FORMAT_BC5: return GL_COMPRESSED_RG_RGTC2;
        default: return 0;
    }
}

static inline GLenum r3d_format_to_gl_format(r3d_dds_format_t format)
{
    switch (format) {
        case R3D_DDS_FORMAT_R8_UNORM:
        case R3D_DDS_FORMAT_R16_FLOAT:
        case R3D_DDS_FORMAT_R32_FLOAT: return GL_RED;
        case R3D_DDS_FORMAT_R8G8_UNORM:
        case R3D_DDS_FORMAT_R16G16_FLOAT:
        case R3D_DDS_FORMAT_R32G32_FLOAT: return GL_RG;
        case R3D_DDS_FORMAT_R8G8B8_UNORM:
        case R3D_DDS_FORMAT_R32G32B32_FLOAT: return GL_RGB;
        case R3D_DDS_FORMAT_R8G8B8A8_UNORM:
        case R3D_DDS_FORMAT_R16G16B16A16_FLOAT:
        case R3D_DDS_FORMAT_R32G32B32A32_FLOAT: return GL_RGBA;
        default: return 0; // Compressed formats don't use this
    }
}

static inline GLenum r3d_format_to_gl_type(r3d_dds_format_t format)
{
    switch (format) {
        case R3D_DDS_FORMAT_R8_UNORM:
        case R3D_DDS_FORMAT_R8G8_UNORM:
        case R3D_DDS_FORMAT_R8G8B8_UNORM:
        case R3D_DDS_FORMAT_R8G8B8A8_UNORM: return GL_UNSIGNED_BYTE;
        case R3D_DDS_FORMAT_R16_FLOAT:
        case R3D_DDS_FORMAT_R16G16_FLOAT:
        case R3D_DDS_FORMAT_R16G16B16A16_FLOAT: return GL_HALF_FLOAT;
        case R3D_DDS_FORMAT_R32_FLOAT:
        case R3D_DDS_FORMAT_R32G32_FLOAT:
        case R3D_DDS_FORMAT_R32G32B32_FLOAT:
        case R3D_DDS_FORMAT_R32G32B32A32_FLOAT: return GL_FLOAT;
        default: return 0; // Compressed formats don't use this
    }
}

static inline int r3d_format_is_compressed(r3d_dds_format_t format) {
    return (format >= R3D_DDS_FORMAT_BC1 && format <= R3D_DDS_FORMAT_BC5);
}

/* === Main Loader Function === */

const void* r3d_load_dds_from_memory(const unsigned char* file_data, uint32_t* w, uint32_t* h, r3d_dds_format_t* format, uint32_t* data_size)
{
    if (!file_data || !w || !h || !format) {
        return NULL;
    }

    const unsigned char* ptr = file_data;

    // Check DDS magic
    uint32_t magic = *(uint32_t*)ptr;
    if (magic != DDS_MAGIC) {
        return NULL;
    }
    ptr += sizeof(uint32_t);

    // Read main header
    const dds_header_t* header = (dds_header_t*)ptr;
    if (header->dwSize != sizeof(dds_header_t)) {
        return NULL;
    }
    ptr += sizeof(dds_header_t);

    *w = header->dwWidth;
    *h = header->dwHeight;

    // Determine format
    r3d_dds_format_t detected_format = R3D_DDS_FORMAT_UNKNOWN;
    uint32_t calculated_data_size = 0;

    if (header->ddspf.dwFourCC == FOURCC_DX10) {
        // DX10 extended header
        const dds_header_dx10_t* dx10_header = (dds_header_dx10_t*)ptr;
        ptr += sizeof(dds_header_dx10_t);

        detected_format = dxgi_to_r3d_format(dx10_header->dxgiFormat);
    } else {
        // Legacy format
        detected_format = legacy_format_to_r3d(&header->ddspf);
    }

    *format = detected_format;

    if (detected_format == R3D_DDS_FORMAT_UNKNOWN) {
        return NULL;
    }

    // Calculate data size
    uint32_t bpp = get_bytes_per_pixel(detected_format);
    if (bpp > 0) {
        // Uncompressed format
        calculated_data_size = (*w) * (*h) * bpp;
    } else {
        // Compressed format - use pitch from header or calculate
        if (header->dwPitchOrLinearSize > 0) {
            calculated_data_size = header->dwPitchOrLinearSize;
        } else {
            // Fallback calculation for compressed formats
            uint32_t block_size = 0;
            switch (detected_format) {
                case R3D_DDS_FORMAT_BC1: block_size = 8; break;
                case R3D_DDS_FORMAT_BC2:
                case R3D_DDS_FORMAT_BC3: block_size = 16; break;
                case R3D_DDS_FORMAT_BC4: block_size = 8; break;
                case R3D_DDS_FORMAT_BC5: block_size = 16; break;
                default: return NULL;
            }
            uint32_t blocks_x = ((*w) + 3) / 4;
            uint32_t blocks_y = ((*h) + 3) / 4;
            calculated_data_size = blocks_x * blocks_y * block_size;
        }
    }

    if (data_size) {
        *data_size = calculated_data_size;
    }

    // Return direct pointer to pixel data (no copy)
    return ptr;
}

GLuint r3d_load_dds_texture_from_memory(const unsigned char* file_data, uint32_t* w, uint32_t* h)
{
    r3d_dds_format_t format;
    uint32_t data_size;

    const void* pixel_data = r3d_load_dds_from_memory(file_data, w, h, &format, &data_size);
    if (!pixel_data) {
        return 0;
    }

    // Generate OpenGL texture
    GLuint texture_id;
    glGenTextures(1, &texture_id);
    glBindTexture(GL_TEXTURE_2D, texture_id);

    // Set texture parameters
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

    // Upload texture data
    if (r3d_format_is_compressed(format)) {
        // Compressed texture
        GLenum internal_format = r3d_format_to_gl_internal_format(format);
        if (internal_format == 0) {
            glDeleteTextures(1, &texture_id);
            return 0;
        }
        glCompressedTexImage2D(GL_TEXTURE_2D, 0, internal_format, *w, *h, 0, data_size, pixel_data);
    }
    else {
        // Uncompressed texture
        GLenum internal_format = r3d_format_to_gl_internal_format(format);
        GLenum gl_format = r3d_format_to_gl_format(format);
        GLenum gl_type = r3d_format_to_gl_type(format);
        if (internal_format == 0 || gl_format == 0 || gl_type == 0) {
            glDeleteTextures(1, &texture_id);
            return 0;
        }
        glTexImage2D(GL_TEXTURE_2D, 0, internal_format, *w, *h, 0, gl_format, gl_type, pixel_data);
    }

    glBindTexture(GL_TEXTURE_2D, 0);
    return texture_id;
}
