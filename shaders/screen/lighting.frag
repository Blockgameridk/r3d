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

#define PI  3.1415926535897931
#define TAU 6.2831853071795862

#define DIRLIGHT    0
#define SPOTLIGHT   1
#define OMNILIGHT   2

/* === Structs === */

struct Light
{
    mat4 matVP;                     //< View/projection matrix of the light, used for directional and spot shadow projection
    sampler2D shadowMap;            //< 2D shadow map used for directional and spot shadow projection
    samplerCube shadowCubemap;      //< Cube shadow map used for omni-directional shadow projection
    vec3 color;                     //< Light color modulation tint
    vec3 position;                  //< Light position (spot/omni)
    vec3 direction;                 //< Light direction (spot/dir)
    float specular;                 //< Specular factor (not physically accurate but provides more flexibility)
    float energy;                   //< Light energy factor
    float range;                    //< Maximum distance the light can travel before being completely attenuated (spot/omni)
    float size;                     //< Light size, currently used only for shadows (PCSS)
    float near;                     //< Near plane for the shadow map projection
    float far;                      //< Far plane for the shadow map projection
    float attenuation;              //< Additional light attenuation factor (spot/omni)
    float innerCutOff;              //< Spot light inner cutoff angle
    float outerCutOff;              //< Spot light outer cutoff angle
    float shadowSoftness;           //< Softness factor to simulate a penumbra
    float shadowMapTxlSz;           //< Size of a texel in the 2D shadow map
    float shadowDepthBias;          //< Constant depth bias applied to shadow mapping to reduce shadow acne
    float shadowSlopeBias;          //< Additional bias scaled by surface slope to reduce artifacts on angled geometry
    lowp int type;                  //< Light type (dir/spot/omni)
    bool shadow;                    //< Indicates whether the light generates shadows
};

/* === Varyings === */

noperspective in vec2 vTexCoord;

/* === Uniforms === */

uniform sampler2D uTexAlbedo;
uniform sampler2D uTexNormal;
uniform sampler2D uTexDepth;
uniform sampler2D uTexORM;

uniform sampler2D uTexNoise;   //< Noise texture (used for soft shadows)

uniform Light uLight;

uniform vec3 uViewPosition;
uniform mat4 uMatInvProj;
uniform mat4 uMatInvView;

/* === Fragments === */

layout(location = 0) out vec4 FragDiffuse;
layout(location = 1) out vec4 FragSpecular;

/* === Constants === */

#define TEX_NOISE_SIZE 64
#define SHADOW_SAMPLES 12

const vec2 POISSON_DISK[SHADOW_SAMPLES] = vec2[]
(
    vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725),
    vec2(-0.094184101, -0.92938870), vec2(0.34495938, 0.29387760),
    vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464),
    vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379),
    vec2(0.44323325, -0.97511554), vec2(0.53742981, -0.47373420),
    vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188)
);

/* === PBR functions === */

float DistributionGGX(float cosTheta, float alpha)
{
    // Standard GGX/Trowbridge-Reitz distribution - optimized form
    float a = cosTheta * alpha;
    float k = alpha / (1.0 - cosTheta * cosTheta + a * a);
    return k * k * (1.0 / PI);
}

float GeometryGGX(float NdotL, float NdotV, float roughness)
{
    // Hammon's optimized approximation for GGX Smith geometry term
    // This version is an efficient approximation that:
    // 1. Avoids expensive square root calculations
    // 2. Combines both G1 terms into a single expression
    // 3. Provides very close results to the exact version at a much lower cost
    // SEE: https://www.gdcvault.com/play/1024478/PBR-Diffuse-Lighting-for-GGX
    return 0.5 / mix(2.0 * NdotL * NdotV, NdotL + NdotV, roughness);
}

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

/* === Lighting functions === */

float Diffuse(float cLdotH, float cNdotV, float cNdotL, float roughness)
{
    float FD90_minus_1 = 2.0 * cLdotH * cLdotH * roughness - 0.5;
    float FdV = 1.0 + FD90_minus_1 * SchlickFresnel(cNdotV);
    float FdL = 1.0 + FD90_minus_1 * SchlickFresnel(cNdotL);

    return (1.0 / PI) * (FdV * FdL * cNdotL); // Diffuse BRDF (Burley)
}

vec3 Specular(vec3 F0, float cLdotH, float cNdotH, float cNdotV, float cNdotL, float roughness)
{
    roughness = max(roughness, 1e-3);

    float alphaGGX = roughness * roughness;
    float D = DistributionGGX(cNdotH, alphaGGX);
    float G = GeometryGGX(cNdotL, cNdotV, alphaGGX);

    float cLdotH5 = SchlickFresnel(cLdotH);
    float F90 = clamp(50.0 * F0.g, 0.0, 1.0);
    vec3 F = F0 + (F90 - F0) * cLdotH5;

    return cNdotL * D * F * G; // Specular BRDF (Schlick GGX)
}

/* === Shadow functions === */

vec2 Rotate2D(vec2 v, float c, float s)
{
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

float ShadowOmni(vec3 position, float cNdotL)
{
    /* --- Light Vector and Distance Calculation --- */

    vec3 lightToFrag = position - uLight.position;
    float currentDepth = length(lightToFrag);
    vec3 direction = normalize(lightToFrag);

    /* --- Shadow Bias and Depth Adjustment --- */

    float bias = uLight.shadowSlopeBias * (1.0 - cNdotL * 0.5);
    bias = max(bias, uLight.shadowDepthBias * currentDepth);
    currentDepth -= bias;

    /* --- Adaptive Softness Based on Distance --- */

    float adaptiveRadius = uLight.shadowSoftness * sqrt(currentDepth / uLight.far);

    /* --- Tangent Space Construction for Sampling --- */

    vec3 up = abs(direction.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(up, direction));
    vec3 bitangent = cross(direction, tangent);

    /* --- Blue Noise Rotation for Sample Distribution --- */

    float rotationAngle = texture(uTexNoise, gl_FragCoord.xy * (1.0/float(TEX_NOISE_SIZE))).r * TAU;
    float rc = cos(rotationAngle);
    float rs = sin(rotationAngle);

    /* --- Central Shadow Sample --- */

    float centerDepth = texture(uLight.shadowCubemap, direction).r * uLight.far;
    float shadow = step(currentDepth, centerDepth);

    /* --- Poisson Disk PCF Sampling --- */

    for (int i = 0; i < SHADOW_SAMPLES; ++i)
    {
        vec2 rotatedOffset = Rotate2D(POISSON_DISK[i], rc, rs);
        vec3 sampleDir = normalize(direction + (tangent * rotatedOffset.x + bitangent * rotatedOffset.y) * adaptiveRadius);
        
        float sampleDepth = texture(uLight.shadowCubemap, sampleDir).r * uLight.far;
        shadow += step(currentDepth, sampleDepth);
    }

    /* --- Final Shadow Value --- */

    return shadow / float(SHADOW_SAMPLES + 1);
}

float Shadow(vec3 position, float cNdotL)
{
    /* --- Light Space Projection --- */

    vec4 projPos = uLight.matVP * vec4(position, 1.0);
    vec3 projCoords = projPos.xyz / projPos.w * 0.5 + 0.5;

    /* --- Shadow Map Bounds Check --- */

    bool insideUpperBound = all(lessThanEqual(projCoords, vec3(1.0)));
    bool insideLowerBound = all(greaterThanEqual(projCoords, vec3(0.0)));

    if (!(insideUpperBound && insideLowerBound)) {
        return 1.0;
    }

    /* --- Shadow Bias and Depth Adjustment --- */

    float bias = uLight.shadowSlopeBias * (1.0 - cNdotL);
    bias = max(bias, uLight.shadowDepthBias * projCoords.z);
    float currentDepth = projCoords.z - bias;

    /* --- Distance-Based Adaptive Softness --- */

    float adaptiveRadius = uLight.shadowSoftness * sqrt(projCoords.z);

    /* --- Blue Noise Rotation for Sample Distribution --- */

    float rotationAngle = texture(uTexNoise, gl_FragCoord.xy * (1.0/float(TEX_NOISE_SIZE))).r * TAU;
    float rc = cos(rotationAngle);
    float rs = sin(rotationAngle);

    /* --- Central Shadow Sample --- */

    float shadow = step(currentDepth, texture(uLight.shadowMap, projCoords.xy).r);

    /* --- Poisson Disk PCF Sampling --- */

    for (int i = 0; i < SHADOW_SAMPLES; ++i)
    {
        vec2 offset = Rotate2D(POISSON_DISK[i], rc, rs) * adaptiveRadius;
        shadow += step(currentDepth, texture(uLight.shadowMap, projCoords.xy + offset).r);
    }

    /* --- Final Shadow Value --- */

    return shadow / float(SHADOW_SAMPLES + 1);
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
    float roughness = orm.g;
    float metalness = orm.b;

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

    /* Compute light direction and the dot product of the normal and light direction */

    vec3 L = (uLight.type == DIRLIGHT) ? -uLight.direction : normalize(uLight.position - position);

    float NdotL = max(dot(N, L), 0.0);
    float cNdotL = min(NdotL, 1.0); // Clamped to avoid division by zero

    /* Compute the halfway vector between the view and light directions */

    vec3 H = normalize(V + L);

    float LdotH = max(dot(L, H), 0.0);
    float cLdotH = min(dot(L, H), 1.0);

    float NdotH = max(dot(N, H), 0.0);
    float cNdotH = min(NdotH, 1.0);

    /* Compute light color energy */

    vec3 lightColE = uLight.color * uLight.energy;

    /* Compute diffuse lighting */

    float diffuseStrength = 1.0 - metalness;  // 0.0 for pure metal, 1.0 for dielectric
    vec3 diffuse = lightColE * Diffuse(cLdotH, cNdotV, cNdotL, roughness) * diffuseStrength;

    /* Compute specular lighting */

    vec3 specular =  Specular(F0, cLdotH, cNdotH, cNdotV, cNdotL, roughness);
    specular *= lightColE * uLight.specular;

    /* Apply shadow factor in addition to the SSAO if the light casts shadows */

    float shadow = 1.0;

    if (uLight.shadow)
    {
        if (uLight.type != OMNILIGHT) shadow = Shadow(position, cNdotL);
        else shadow = ShadowOmni(position, cNdotL);
    }

    /* Apply attenuation based on the distance from the light */

    if (uLight.type != DIRLIGHT)
    {
        float dist = length(uLight.position - position);
        float atten = 1.0 - clamp(dist / uLight.range, 0.0, 1.0);
        shadow *= atten * uLight.attenuation;
    }

    /* Apply spotlight effect if the light is a spotlight */

    if (uLight.type == SPOTLIGHT)
    {
        float theta = dot(L, -uLight.direction);
        float epsilon = (uLight.innerCutOff - uLight.outerCutOff);
        shadow *= smoothstep(0.0, 1.0, (theta - uLight.outerCutOff) / epsilon);
    }

    /* Compute final lighting contribution */
    
    FragDiffuse = vec4(diffuse * shadow, 1.0);
    FragSpecular = vec4(specular * shadow, 1.0);
}
