/* === Constants === */

#define M_PI        3.1415926535897931
#define M_TAU       6.2831853071795862
#define M_INV_PI    0.3183098861837907

/* === Functions === */

vec3 M_Rotate3D(vec3 v, vec4 q)
{
    vec3 t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}

mat3 M_OrthonormalBasis(vec3 N)
{
    // Frisvad's method for generating a stable orthonormal basis
    // See: https://backend.orbit.dtu.dk/ws/portalfiles/portal/126824972/onb_frisvad_jgt2012_v2.pdf
    vec3 T, B;
    if (N.z < -0.9999999) {
        T = vec3(0.0, -1.0, 0.0);
        B = vec3(-1.0, 0.0, 0.0);
    }
    else {
        float a = 1.0 / (1.0 + N.z);
        float b = -N.x * N.y * a;
        T = vec3(1.0 - N.x * N.x * a, b, -N.x);
        B = vec3(b, 1.0 - N.y * N.y * a, -N.y);
    }
    return mat3(T, B, N);
}
