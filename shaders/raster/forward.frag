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

#define NUM_LIGHTS  8

#define DIRLIGHT    0
#define SPOTLIGHT   1
#define OMNILIGHT   2

/* === Structs === */

struct Light
{
    vec3 color;
    vec3 position;
    vec3 direction;
    float specular;
    float energy;
    float range;
    float near;
    float far;
    float attenuation;
    float innerCutOff;
    float outerCutOff;
    float shadowSoftness;
    float shadowMapTxlSz;
    float shadowDepthBias;
    float shadowSlopeBias;
    lowp int type;
    bool enabled;
    bool shadow;
};

/* === Varyings === */

in vec3 vPosition;
in vec2 vTexCoord;
in vec4 vColor;
in mat3 vTBN;

in vec4 vPosLightSpace[NUM_LIGHTS];

/* === Uniforms === */

uniform sampler2D uTexAlbedo;
uniform sampler2D uTexEmission;
uniform sampler2D uTexNormal;
uniform sampler2D uTexORM;

uniform sampler2D uTexNoise;   //< Noise texture (used for soft shadows)

uniform samplerCube uShadowMapCube[NUM_LIGHTS];
uniform sampler2D uShadowMap2D[NUM_LIGHTS];

uniform float uEmissionEnergy;
uniform float uNormalScale;
uniform float uOcclusion;
uniform float uRoughness;
uniform float uMetalness;

uniform vec3 uAmbientColor;
uniform vec3 uEmissionColor;

uniform samplerCube uCubeIrradiance;
uniform samplerCube uCubePrefilter;
uniform sampler2D uTexBrdfLut;
uniform vec4 uQuatSkybox;
uniform bool uHasSkybox;
uniform float uSkyboxAmbientIntensity;
uniform float uSkyboxReflectIntensity;

uniform Light uLights[NUM_LIGHTS];

uniform float uAlphaCutoff;
uniform vec3 uViewPosition;
uniform float uFar;

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

/* === Fragments === */

layout(location = 0) out vec4 FragColor;
layout(location = 1) out vec4 FragAlbedo;
layout(location = 2) out vec4 FragNormal;
layout(location = 3) out vec4 FragORM;

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

float ShadowOmni(int i, float cNdotL)
{
    Light light = uLights[i];

    /* --- Light Vector and Distance Calculation --- */

    vec3 lightToFrag = vPosition - light.position;
    float currentDepth = length(lightToFrag);
    vec3 direction = normalize(lightToFrag);

    /* --- Shadow Bias and Depth Adjustment --- */

    float bias = light.shadowSlopeBias * (1.0 - cNdotL * 0.5);
    bias = max(bias, light.shadowDepthBias * currentDepth);
    currentDepth -= bias;

    /* --- Adaptive Softness Based on Distance --- */

    float adaptiveRadius = light.shadowSoftness * sqrt(currentDepth / light.far);

    /* --- Tangent Space Construction for Sampling --- */

    vec3 up = abs(direction.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(up, direction));
    vec3 bitangent = cross(direction, tangent);

    /* --- Blue Noise Rotation for Sample Distribution --- */

    float rotationAngle = texture(uTexNoise, gl_FragCoord.xy * (1.0/float(TEX_NOISE_SIZE))).r * TAU;
    float rc = cos(rotationAngle);
    float rs = sin(rotationAngle);

    /* --- Central Shadow Sample --- */

    float centerDepth = texture(uShadowMapCube[i], direction).r * light.far;
    float shadow = step(currentDepth, centerDepth);

    /* --- Poisson Disk PCF Sampling --- */

    for (int j = 0; j < SHADOW_SAMPLES; ++j)
    {
        vec2 rotatedOffset = Rotate2D(POISSON_DISK[j], rc, rs);
        vec3 sampleDir = normalize(direction + (tangent * rotatedOffset.x + bitangent * rotatedOffset.y) * adaptiveRadius);
        
        float sampleDepth = texture(uShadowMapCube[i], sampleDir).r * light.far;
        shadow += step(currentDepth, sampleDepth);
    }

    /* --- Final Shadow Value --- */

    return shadow / float(SHADOW_SAMPLES + 1);
}

float Shadow(int i, float cNdotL)
{
    Light light = uLights[i];

    /* --- Light Space Projection --- */

    vec4 p = vPosLightSpace[i];
    vec3 projCoords = p.xyz / p.w;
    projCoords = projCoords * 0.5 + 0.5;

    /* --- Shadow Map Bounds Check --- */

    bool insideUpperBound = all(lessThanEqual(projCoords, vec3(1.0)));
    bool insideLowerBound = all(greaterThanEqual(projCoords, vec3(0.0)));

    if (!(insideUpperBound && insideLowerBound)) {
        return 1.0;
    }

    /* --- Shadow Bias and Depth Adjustment --- */

    float bias = light.shadowSlopeBias * (1.0 - cNdotL);
    bias = max(bias, light.shadowDepthBias * projCoords.z);
    float currentDepth = projCoords.z - bias;

    /* --- Distance-Based Adaptive Softness --- */

    float adaptiveRadius = light.shadowSoftness * sqrt(projCoords.z);

    /* --- Blue Noise Rotation for Sample Distribution --- */

    float rotationAngle = texture(uTexNoise, gl_FragCoord.xy * (1.0/float(TEX_NOISE_SIZE))).r * TAU;
    float rc = cos(rotationAngle);
    float rs = sin(rotationAngle);

    /* --- Central Shadow Sample --- */

    float shadow = step(currentDepth, texture(uShadowMap2D[i], projCoords.xy).r);

    /* --- Poisson Disk PCF Sampling --- */

    for (int j = 0; j < SHADOW_SAMPLES; ++j)
    {
        vec2 offset = Rotate2D(POISSON_DISK[j], rc, rs) * adaptiveRadius;
        shadow += step(currentDepth, texture(uShadowMap2D[i], projCoords.xy + offset).r);
    }

    /* --- Final Shadow Value --- */

    return shadow / float(SHADOW_SAMPLES + 1);
}

/* === Helper functions === */

vec2 OctahedronWrap(vec2 val)
{
    // Reference(s):
    // - Octahedron normal vector encoding
    //   https://web.archive.org/web/20191027010600/https://knarkowicz.wordpress.com/2014/04/16/octahedron-normal-vector-encoding/comment-page-1/
    return (1.0 - abs(val.yx)) * mix(vec2(-1.0), vec2(1.0), vec2(greaterThanEqual(val.xy, vec2(0.0))));
}

vec2 EncodeOctahedral(vec3 normal)
{
    normal /= abs(normal.x) + abs(normal.y) + abs(normal.z);
    normal.xy = normal.z >= 0.0 ? normal.xy : OctahedronWrap(normal.xy);
    normal.xy = normal.xy * 0.5 + 0.5;
    return normal.xy;
}

vec3 NormalScale(vec3 normal, float scale)
{
    normal.xy *= scale;
    normal.z = sqrt(1.0 - clamp(dot(normal.xy, normal.xy), 0.0, 1.0));
    return normal;
}

vec3 RotateWithQuat(vec3 v, vec4 q)
{
    vec3 t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}

/* === Main === */

void main()
{
    /* Sample albedo texture */

    vec4 albedo = vColor * texture(uTexAlbedo, vTexCoord);

    // TODO: Alpha scissor is unnecessary after a depth pre-pass
    if (albedo.a < uAlphaCutoff) discard;

    /* Sample emission texture */

    vec3 emission = uEmissionEnergy * (uEmissionColor * texture(uTexEmission, vTexCoord).rgb);

    /* Sample ORM texture and extract values */

    vec3 orm = texture(uTexORM, vTexCoord).rgb;

    float occlusion = uOcclusion * orm.x;
    float roughness = uRoughness * orm.y;
    float metalness = uMetalness * orm.z;

    /* Compute F0 (reflectance at normal incidence) based on the metallic factor */

    vec3 F0 = ComputeF0(metalness, 0.5, albedo.rgb);

    /* Sample normal and compute view direction vector */

    vec3 N = normalize(vTBN * NormalScale(texture(uTexNormal, vTexCoord).rgb * 2.0 - 1.0, uNormalScale));
    vec3 V = normalize(uViewPosition - vPosition);

    /* Compute the dot product of the normal and view direction */

    float NdotV = dot(N, V);
    float cNdotV = max(NdotV, 1e-4);  // Clamped to avoid division by zero

    /* Loop through all light sources accumulating diffuse and specular light */

    vec3 diffuse = vec3(0.0);
    vec3 specular = vec3(0.0);

    for (int i = 0; i < NUM_LIGHTS; i++)
    {
        if (!uLights[i].enabled) {
            continue;
        }

        Light light = uLights[i];

        /* Compute light direction */

        vec3 L = vec3(0.0);
        if (light.type == DIRLIGHT) L = -light.direction;
        else L = normalize(light.position - vPosition);

        /* Compute the dot product of the normal and light direction */

        float NdotL = max(dot(N, L), 0.0);
        float cNdotL = min(NdotL, 1.0); // clamped NdotL

        /* Compute the halfway vector between the view and light directions */

        vec3 H = normalize(V + L);

        float LdotH = max(dot(L, H), 0.0);
        float cLdotH = min(dot(L, H), 1.0);

        float NdotH = max(dot(N, H), 0.0);
        float cNdotH = min(NdotH, 1.0);

        /* Compute light color energy */

        vec3 lightColE = light.color * light.energy;

        /* Compute diffuse lighting */

        float diffuseStrength = 1.0 - metalness;  // 0.0 for pure metal, 1.0 for dielectric
        vec3 diffLight = lightColE * Diffuse(cLdotH, cNdotV, cNdotL, roughness) * diffuseStrength;

        /* Compute specular lighting */

        vec3 specLight =  Specular(F0, cLdotH, cNdotH, cNdotV, cNdotL, roughness);
        specLight *= lightColE * light.specular;

        /* Apply shadow factor if the light casts shadows */

        float shadow = 1.0;
        if (light.shadow) {
            if (light.type == OMNILIGHT) {
                shadow = ShadowOmni(i, cNdotL);
            }
            else {
                shadow = Shadow(i, cNdotL);
            }
        }

        /* Apply attenuation based on the distance from the light */

        if (light.type != DIRLIGHT)
        {
            float dist = length(light.position - vPosition);
            float atten = 1.0 - clamp(dist / light.range, 0.0, 1.0);
            shadow *= atten * light.attenuation;
        }

        /* Apply spotlight effect if the light is a spotlight */

        if (light.type == SPOTLIGHT)
        {
            float theta = dot(L, -light.direction);
            float epsilon = (light.innerCutOff - light.outerCutOff);
            shadow *= smoothstep(0.0, 1.0, (theta - light.outerCutOff) / epsilon);
        }

        /* Accumulate the diffuse and specular lighting contributions */

        diffuse += diffLight * shadow;
        specular += specLight * shadow;
    }

    /* Compute ambient - (IBL diffuse) */

    vec3 ambient = uAmbientColor;

    if (uHasSkybox)
    {
        vec3 kS = F0 + (1.0 - F0) * SchlickFresnel(cNdotV);
        vec3 kD = (1.0 - kS) * (1.0 - metalness);

        vec3 Nr = RotateWithQuat(N, uQuatSkybox);

        ambient = kD * (texture(uCubeIrradiance, Nr).rgb * uSkyboxAmbientIntensity);
    }
    else
    {
        const float NdotV_ = 1.0; // view facing normal, for ambient assume facing camera
        vec3 kS = F0 + (1.0 - F0) * SchlickFresnel(NdotV_);
        vec3 kD = (1.0 - kS) * (1.0 - metalness);
        ambient *= (kD * albedo.rgb + kS);
    }

    /* Compute ambient occlusion map */

    ambient *= occlusion;

    // Light affect should be material-specific
    //float lightAffect = mix(1.0, ao, uValAOLightAffect);
    //specular *= lightAffect;
    //diffuse *= lightAffect;

    /* Skybox reflection - (IBL specular) */

    if (uHasSkybox)
    {
        vec3 R = RotateWithQuat(reflect(-V, N), uQuatSkybox);

        const float MAX_REFLECTION_LOD = 7.0;
        vec3 prefilteredColor = textureLod(uCubePrefilter, R, roughness * MAX_REFLECTION_LOD).rgb;

        float fresnelTerm = SchlickFresnel(cNdotV);
        vec3 F = F0 + (max(vec3(1.0 - roughness), F0) - F0) * fresnelTerm;

        vec2 brdf = texture(uTexBrdfLut, vec2(cNdotV, roughness)).rg;
        vec3 specularReflection = prefilteredColor * (F * brdf.x + brdf.y);

        specular += specularReflection * uSkyboxReflectIntensity;
    }

    /* Compute the final diffuse color, including ambient and diffuse lighting contributions */

    diffuse = albedo.rgb * (ambient + diffuse);

    /* Compute the final fragment color by combining diffuse, specular, and emission contributions */

    FragColor = vec4(diffuse + specular + emission, albedo.a);

    /* Output material data */

    FragAlbedo = vec4(albedo.rgb, 1.0);
    FragNormal = vec4(EncodeOctahedral(N), vec2(1.0));
    FragORM = vec4(occlusion, roughness, metalness, 1.0);
}
