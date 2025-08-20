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

#ifdef IBL

/* === Defines === */

#define PI 3.1415926535897932384626433832795028

/* === Varyings === */

noperspective in vec2 vTexCoord;

/* === Uniforms === */

uniform sampler2D uTexAlbedo;
uniform sampler2D uTexNormal;
uniform sampler2D uTexDepth;
uniform sampler2D uTexSSAO;
uniform sampler2D uTexORM;

uniform samplerCube uCubeIrradiance;
uniform samplerCube uCubePrefilter;
uniform sampler2D uTexBrdfLut;
uniform vec4 uQuatSkybox;
uniform float uSkyboxAmbientIntensity;
uniform float uSkyboxReflectIntensity;

uniform vec3 uViewPosition;
uniform mat4 uMatInvProj;
uniform mat4 uMatInvView;

/* === Fragments === */

layout(location = 0) out vec3 FragDiffuse;
layout(location = 1) out vec3 FragSpecular;

/* === PBR functions === */

float SchlickFresnel(float u)
{
    float m = 1.0 - u;
    float m2 = m * m;
    return m2 * m2 * m; // pow(m,5)
}

vec3 ComputeF0(float metallic, float specular, vec3 albedo)
{
    float dielectric = 0.16 * specular * specular;
    // use (albedo * metallic) as colored specular reflectance at 0 angle for metallic materials
    // SEE: https://google.github.io/filament/Filament.md.html
    return mix(vec3(dielectric), albedo, vec3(metallic));
}

/* === Misc functions === */

vec3 GetPositionFromDepth(float depth)
{
    vec4 ndcPos = vec4(vTexCoord * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 viewPos = uMatInvProj * ndcPos;
    viewPos /= viewPos.w;

    return (uMatInvView * viewPos).xyz;
}

vec2 OctahedronWrap(vec2 val)
{
    // Reference(s):
    // - Octahedron normal vector encoding
    //   https://web.archive.org/web/20191027010600/https://knarkowicz.wordpress.com/2014/04/16/octahedron-normal-vector-encoding/comment-page-1/
    return (1.0 - abs(val.yx)) * mix(vec2(-1.0), vec2(1.0), vec2(greaterThanEqual(val.xy, vec2(0.0))));
}

vec3 DecodeOctahedral(vec2 encoded)
{
    encoded = encoded * 2.0 - 1.0;

    vec3 normal;
    normal.z  = 1.0 - abs(encoded.x) - abs(encoded.y);
    normal.xy = normal.z >= 0.0 ? encoded.xy : OctahedronWrap(encoded.xy);
    return normalize(normal);
}

vec3 RotateWithQuat(vec3 v, vec4 q)
{
    vec3 t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}

/* === Main === */

void main()
{
    /* Sample albedo and ORM texture and extract values */
    
    vec3 albedo = texture(uTexAlbedo, vTexCoord).rgb;
    vec3 orm = texture(uTexORM, vTexCoord).rgb;
    float occlusion = orm.r;
    float roughness = orm.g;
    float metalness = orm.b;

    /* Sample SSAO buffer and modulate occlusion value */

    occlusion *= texture(uTexSSAO, vTexCoord).r;

    /* Compute F0 (reflectance at normal incidence) based on the metallic factor */

    vec3 F0 = ComputeF0(metalness, 0.5, albedo);

    /* Sample world depth and reconstruct world position */

    float depth = texture(uTexDepth, vTexCoord).r;
    vec3 position = GetPositionFromDepth(depth);

    /* Sample and decode normal in world space */

    vec3 N = DecodeOctahedral(texture(uTexNormal, vTexCoord).rg);

    /* Compute view direction and the dot product of the normal and view direction */
    
    vec3 V = normalize(uViewPosition - position);

    float NdotV = dot(N, V);
    float cNdotV = max(NdotV, 1e-4); // Clamped to avoid division by zero

    /* Compute ambient - IBL diffuse */

    vec3 kS = F0 + (1.0 - F0) * SchlickFresnel(cNdotV);
    vec3 kD = (1.0 - kS) * (1.0 - metalness);

    vec3 Nr = RotateWithQuat(N, uQuatSkybox);
    FragDiffuse = kD * texture(uCubeIrradiance, Nr).rgb;
    FragDiffuse *= occlusion * uSkyboxAmbientIntensity;

    /* Skybox reflection - IBL specular */

    vec3 R = RotateWithQuat(reflect(-V, N), uQuatSkybox);

    const float MAX_REFLECTION_LOD = 7.0;
    vec3 prefilteredColor = textureLod(uCubePrefilter, R, roughness * MAX_REFLECTION_LOD).rgb;

    vec2 brdf = texture(uTexBrdfLut, vec2(cNdotV, roughness)).rg;
    vec3 specularReflection = prefilteredColor * (F0 * brdf.x + brdf.y); // LUT handles fresnel
    FragSpecular = specularReflection * uSkyboxReflectIntensity;
}

#else

/* === Varyings === */

noperspective in vec2 vTexCoord;

/* === Uniforms === */

uniform sampler2D uTexAlbedo;
uniform sampler2D uTexSSAO;
uniform sampler2D uTexORM;
uniform vec3 uAmbientColor;

/* === Fragments === */

layout(location = 0) out vec4 FragDiffuse;

/* === Helper Functions === */

vec3 ComputeF0(float metallic, float specular, vec3 albedo)
{
    float dielectric = 0.16 * specular * specular;
    // use (albedo * metallic) as colored specular reflectance at 0 angle for metallic materials
    // SEE: https://google.github.io/filament/Filament.md.html
    return mix(vec3(dielectric), albedo, vec3(metallic));
}

float SchlickFresnel(float u)
{
    float m = 1.0 - u;
    float m2 = m * m;
    return m2 * m2 * m; // pow(m,5)
}

/* === Main === */

void main()
{
    /* --- Material properties --- */

    vec3 albedo = texture(uTexAlbedo, vTexCoord).rgb;
    vec3 orm = texture(uTexORM, vTexCoord).rgb;

    float occlusion = orm.r;
    float roughness = orm.g;
    float metalness = orm.b;

    /* --- Ambient occlusion (SSAO) --- */

    float ssao = texture(uTexSSAO, vTexCoord).r;
    occlusion *= ssao;

    /* --- PBR surface reflectance model --- */

    vec3 F0 = ComputeF0(metalness, 0.5, albedo);  // Specular reflectance at normal incidence

    const float NdotV = 1.0;  // For ambient lighting, assume normal facing the view direction

    vec3 kS = F0 + (1.0 - F0) * SchlickFresnel(NdotV);          // Specular reflection coefficient
    vec3 kD = (1.0 - kS) * (1.0 - metalness);                   // Diffuse coefficient (non-metallic part)

    /* --- Ambient lighting (diffuse + specular) --- */

    vec3 ambient = uAmbientColor;                               // Ambient light tint (scene-level)
    ambient *= (kD * albedo + kS);                              // Apply material response
    ambient *= occlusion;                                       // Apply ambient occlusion

    /* --- Output --- */

    FragDiffuse = vec4(ambient, 1.0);
}

#endif
