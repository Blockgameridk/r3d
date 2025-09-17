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

#version 330 core

/* === Includes === */

#include "../include/math.glsl"

/* === Attributes === */

layout (location = 0) in vec3 aPosition;

/* === Uniforms === */

uniform mat4 uMatProj;
uniform mat4 uMatView;
uniform vec4 uRotation;

/* === Varyings === */

out vec3 vPosition;

/* === Program === */

void main()
{
    vPosition = M_Rotate3D(aPosition, uRotation);

    mat4 rotView = mat4(mat3(uMatView));
    gl_Position = uMatProj * rotView * vec4(aPosition, 1.0);
}
