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

/* === Attributes === */

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aTexCoord;
layout(location = 2) in vec3 aNormal;
layout(location = 3) in vec4 aColor;
layout(location = 4) in vec4 aTangent;
layout(location = 5) in ivec4 aBoneIDs;
layout(location = 6) in vec4 aWeights;

/* === Uniforms === */

uniform mat4 uMatNormal;
uniform mat4 uMatModel;
uniform mat4 uMatMVP;

uniform float uEmissionEnergy;
uniform vec3 uEmissionColor;
uniform vec3 uAlbedoColor;

uniform vec2 uTexCoordOffset;
uniform vec2 uTexCoordScale;

uniform sampler1D uTexBoneMatrices;
uniform bool uUseSkinning;

/* === Varyings === */

flat out vec3 vEmission;
out vec2 vTexCoord;
out vec3 vColor;
out mat3 vTBN;

/* === Helper Functions === */

mat4 GetBoneMatrix(int boneID)
{
    int baseIndex = 4 * boneID;

    vec4 row0 = texelFetch(uTexBoneMatrices, baseIndex + 0, 0);
    vec4 row1 = texelFetch(uTexBoneMatrices, baseIndex + 1, 0);
    vec4 row2 = texelFetch(uTexBoneMatrices, baseIndex + 2, 0);
    vec4 row3 = texelFetch(uTexBoneMatrices, baseIndex + 3, 0);

    return transpose(mat4(row0, row1, row2, row3));
}

/* === Main function === */

void main()
{
    vec3 skinnedPosition = aPosition;
    vec3 skinnedNormal = aNormal;
    vec3 skinnedTangent = aTangent.xyz;

    if (uUseSkinning)
    {
        mat4 skinMatrix = 
            aWeights.x * GetBoneMatrix(aBoneIDs.x) +
            aWeights.y * GetBoneMatrix(aBoneIDs.y) +
            aWeights.z * GetBoneMatrix(aBoneIDs.z) +
            aWeights.w * GetBoneMatrix(aBoneIDs.w);

        skinnedPosition = vec3(skinMatrix * vec4(aPosition, 1.0));
        skinnedNormal   = mat3(skinMatrix) * aNormal;
        skinnedTangent  = mat3(skinMatrix) * aTangent.xyz;
    }

    vTexCoord = uTexCoordOffset + aTexCoord * uTexCoordScale;
    vColor = aColor.rgb * uAlbedoColor;
    vEmission = uEmissionColor * uEmissionEnergy;

    vec3 T = normalize(vec3(uMatModel * vec4(skinnedTangent, 0.0)));
    vec3 N = normalize(vec3(uMatNormal * vec4(skinnedNormal, 0.0)));
    vec3 B = normalize(cross(N, T)) * aTangent.w;
    vTBN = mat3(T, B, N);

    gl_Position = uMatMVP * vec4(skinnedPosition, 1.0);
}
