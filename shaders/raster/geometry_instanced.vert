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

/* === Defines === */

#define BILLBOARD_FRONT 1
#define BILLBOARD_Y_AXIS 2

/* === Attributes === */

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aTexCoord;
layout(location = 2) in vec3 aNormal;
layout(location = 3) in vec4 aColor;
layout(location = 4) in vec4 aTangent;
layout(location = 5) in ivec4 aBoneIDs;
layout(location = 6) in vec4 aWeights;

/* === Instance attributes === */

layout(location = 10) in mat4 iMatModel;
layout(location = 14) in vec4 iColor;

/* === Uniforms === */

uniform mat4 uMatInvView;       ///< Only for billboard modes
uniform mat4 uMatModel;
uniform mat4 uMatVP;

uniform lowp int uBillboardMode;

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

/* === Helper functions === */

mat4 GetBoneMatrix(int boneID)
{
    int baseIndex = 4 * boneID;

    vec4 row0 = texelFetch(uTexBoneMatrices, baseIndex + 0, 0);
    vec4 row1 = texelFetch(uTexBoneMatrices, baseIndex + 1, 0);
    vec4 row2 = texelFetch(uTexBoneMatrices, baseIndex + 2, 0);
    vec4 row3 = texelFetch(uTexBoneMatrices, baseIndex + 3, 0);

    return transpose(mat4(row0, row1, row2, row3));
}

void BillboardFront(inout mat4 model, inout mat3 normal)
{
    // Extract the original scales of the model
    float scaleX = length(vec3(model[0]));
    float scaleY = length(vec3(model[1]));
    float scaleZ = length(vec3(model[2]));

    // Copy the view basis vectors directly, applying original scales
    model[0] = vec4(uMatInvView[0].xyz * scaleX, 0.0);
    model[1] = vec4(uMatInvView[1].xyz * scaleY, 0.0);
    model[2] = vec4(uMatInvView[2].xyz * scaleZ, 0.0);

    // Update the normal matrix
    normal[0] = uMatInvView[0].xyz;
    normal[1] = uMatInvView[1].xyz;
    normal[2] = uMatInvView[2].xyz;
}

void BillboardY(inout mat4 model, inout mat3 normal)
{
    // Extract the model position
    vec3 position = vec3(model[3]);
    
    // Extract the original scales of the model
    float scaleX = length(vec3(model[0]));
    float scaleY = length(vec3(model[1]));
    float scaleZ = length(vec3(model[2]));
    
    // Preserve the original Y-axis of the model (vertical direction)
    vec3 upVector = normalize(vec3(model[1]));
    
    // Direction from the object to the camera
    vec3 lookDirection = normalize(vec3(uMatInvView[3]) - position);
    
    // Compute the right vector using the cross product
    vec3 rightVector = normalize(cross(upVector, lookDirection));
    
    // Recalculate the front vector to ensure orthogonality
    vec3 frontVector = normalize(cross(rightVector, upVector));
    
    // Construct the new model matrix while preserving the scales
    model[0] = vec4(rightVector * scaleX, 0.0);
    model[1] = vec4(upVector * scaleY, 0.0);
    model[2] = vec4(frontVector * scaleZ, 0.0);
    
    // Update the normal matrix
    normal[0] = rightVector;
    normal[1] = upVector;
    normal[2] = frontVector;
}

/* === Main function === */

void main()
{
    // Apply skinning transformation if enabled
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
    vEmission = uEmissionColor * uEmissionEnergy;        // NOTE: Calculated here, in case we add different emission modes later.
    vColor = aColor.rgb * iColor.rgb * uAlbedoColor;

    mat4 matModel = uMatModel * transpose(iMatModel);
    mat3 matNormal = mat3(0.0);

    if (uBillboardMode == BILLBOARD_FRONT) BillboardFront(matModel, matNormal);
    else if (uBillboardMode == BILLBOARD_Y_AXIS) BillboardY(matModel, matNormal);
    else matNormal = transpose(inverse(mat3(matModel)));

    // The TBN matrix is used to transform vectors from tangent space to world space
    // It is currently used to transform normals from a normal map to world space normals
    vec3 T = normalize(vec3(matModel * vec4(skinnedTangent, 0.0)));
    vec3 N = normalize(matNormal * skinnedNormal);
    vec3 B = normalize(cross(N, T)) * aTangent.w;
    vTBN = mat3(T, B, N);

    gl_Position = uMatVP * (matModel * vec4(skinnedPosition, 1.0));
}
