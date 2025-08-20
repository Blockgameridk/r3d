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

#ifndef R3D_DETAILS_DDS_H
#define R3D_DETAILS_DDS_H

#include <stdint.h>
#include <glad.h>

/* === Format Enum === */

typedef enum {
    R3D_DDS_FORMAT_UNKNOWN = 0,
    R3D_DDS_FORMAT_R8G8B8A8_UNORM,     // 32-bit RGBA
    R3D_DDS_FORMAT_R8G8B8_UNORM,       // 24-bit RGB
    R3D_DDS_FORMAT_R8G8_UNORM,         // 16-bit RG
    R3D_DDS_FORMAT_R8_UNORM,           // 8-bit R
    R3D_DDS_FORMAT_R32G32B32A32_FLOAT, // 128-bit RGBA float
    R3D_DDS_FORMAT_R32G32B32_FLOAT,    // 96-bit RGB float
    R3D_DDS_FORMAT_R32G32_FLOAT,       // 64-bit RG float
    R3D_DDS_FORMAT_R32_FLOAT,          // 32-bit R float
    R3D_DDS_FORMAT_R16G16B16A16_FLOAT, // 64-bit RGBA half
    R3D_DDS_FORMAT_R16G16_FLOAT,       // 32-bit RG half
    R3D_DDS_FORMAT_R16_FLOAT,          // 16-bit R half
    R3D_DDS_FORMAT_BC1,                // DXT1 compressed
    R3D_DDS_FORMAT_BC2,                // DXT3 compressed
    R3D_DDS_FORMAT_BC3,                // DXT5 compressed
    R3D_DDS_FORMAT_BC4,                // ATI1 compressed
    R3D_DDS_FORMAT_BC5                 // ATI2 compressed
} r3d_dds_format_t;

/* === Main Loader Function === */

const void* r3d_load_dds_from_memory(const unsigned char* file_data, uint32_t* w, uint32_t* h, r3d_dds_format_t* format, uint32_t* data_size);
GLuint r3d_load_dds_texture_from_memory(const unsigned char* file_data, uint32_t* w, uint32_t* h);

#endif // R3D_DETAILS_DDS_H
