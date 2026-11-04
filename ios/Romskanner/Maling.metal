// Prøvemaling: veggene males rett i kamerabildet, punkt for punkt.
// Dybden fra LiDAR sier hvor hvert punkt i bildet er i rommet. Ligger punktet på en
// valgt vegg (et plan), får det fargen. Lyset og skyggene fra kamerabildet beholdes.
#include <metal_stdlib>
using namespace metal;

struct Oppsett {
    float4x4 kamera;   // kameraet til rommet
    float4 bildeX;     // skjermpunkt (0–1) til punkt i kamerabildet (0–1)
    float4 bildeY;
    float4 indre;      // fx, fy, cx, cy i bildepunkter
    float4 diverse;    // bildebredde, bildehøyde, dekning, ekte lys
    float4 mer;        // antall vegger, lagre bilde, kilden er lineær
};

struct Vegg {
    float4 plan;   // retning xyz, avstand w: dot(retning, punkt) = avstand
    float4 farge;  // rgb, og lyset veggen har i kamerabildet i w (0 = ikke målt ennå)
};

static float3 tilSrgb(float3 c) {
    c = clamp(c, 0.0, 1.0);
    return select(1.055 * pow(c, 1.0 / 2.4) - 0.055, c * 12.92, c <= 0.0031308);
}

kernel void malVegger(texture2d<half, access::read> kilde [[texture(0)]],
                      texture2d<half, access::write> mal [[texture(1)]],
                      texture2d<float, access::read> dybde [[texture(2)]],
                      texture2d<half, access::write> bilde [[texture(3)]],
                      constant Oppsett& o [[buffer(0)]],
                      constant Vegg* vegger [[buffer(1)]],
                      device atomic_uint* lys [[buffer(2)]],
                      uint2 gid [[thread_position_in_grid]])
{
    uint bredde = mal.get_width();
    uint hoyde = mal.get_height();
    if (gid.x >= bredde || gid.y >= hoyde) return;
    half4 kildeFarge = kilde.read(gid);
    float3 c = float3(kildeFarge.rgb);
    float3 ut = c;
    uint antall = uint(o.mer.x);

    if (antall > 0) {
        float2 uv = (float2(gid) + 0.5) / float2(bredde, hoyde);
        float3 uv1 = float3(uv, 1.0);
        float2 b = float2(dot(o.bildeX.xyz, uv1), dot(o.bildeY.xyz, uv1));
        float2 px = b * o.diverse.xy;
        // Strålen fra kameraet gjennom dette punktet, i rommet
        float3 strale = float3((px.x - o.indre.z) / o.indre.x, -(px.y - o.indre.w) / o.indre.y, -1.0);
        float3 retning = (o.kamera * float4(strale, 0.0)).xyz;
        float3 fra = o.kamera[3].xyz;

        // Fire nabopunkter i dybdekartet, blandet etter hvor nær de er.
        // Da blir kantene myke, uten falske dybder midt mellom vegg og møbel.
        float2 dp = b * float2(dybde.get_width(), dybde.get_height()) - 0.5;
        float2 hel = floor(dp);
        float2 rest = dp - hel;
        int2 maks = int2(dybde.get_width(), dybde.get_height()) - 1;
        float d[4];
        float v[4];
        for (int k = 0; k < 4; k++) {
            int2 q = clamp(int2(hel) + int2(k & 1, k >> 1), int2(0), maks);
            d[k] = dybde.read(uint2(q)).r;
            v[k] = ((k & 1) != 0 ? rest.x : 1.0 - rest.x) * ((k >> 1) != 0 ? rest.y : 1.0 - rest.y);
        }

        float best = 0.0;
        int hvem = -1;
        for (uint i = 0; i < antall; i++) {
            float w = 0.0;
            for (int k = 0; k < 4; k++) {
                if (d[k] < 0.05 || d[k] > 8.0) continue;
                float3 p = fra + retning * d[k];
                float avst = abs(dot(vegger[i].plan.xyz, p) - vegger[i].plan.w);
                // Dybden er mer usikker langt unna: litt mer slingringsmonn der
                float tol = 0.015 + 0.008 * d[k];
                w += v[k] * (1.0 - smoothstep(tol, tol * 2.0, avst));
            }
            if (w > best) { best = w; hvem = int(i); }
        }

        if (hvem >= 0 && best > 0.001) {
            Vegg vg = vegger[hvem];
            float l = clamp(dot(c, float3(0.2126, 0.7152, 0.0722)), 0.0, 4.0);
            float3 maling = vg.farge.rgb;
            // Romlys: der veggen er mørkere enn snittet (skygge), blir malingen også mørkere
            if (o.diverse.w > 0.5 && vg.farge.w > 0.0) maling *= clamp(l / max(vg.farge.w, 0.02), 0.3, 1.4);
            ut = mix(c, maling, best * o.diverse.z);
            // Mål snittlyset på veggen (hvert 64. punkt holder)
            if (best > 0.9 && (gid.x & 7) == 0 && (gid.y & 7) == 0) {
                atomic_fetch_add_explicit(&lys[hvem * 2], uint(l * 1000.0), memory_order_relaxed);
                atomic_fetch_add_explicit(&lys[hvem * 2 + 1], 1u, memory_order_relaxed);
            }
        }
    }

    mal.write(half4(half3(ut), kildeFarge.a), gid);
    if (o.mer.y > 0.5) {
        float3 s = o.mer.z > 0.5 ? tilSrgb(ut) : clamp(ut, 0.0, 1.0);
        bilde.write(half4(half3(s), 1.0h), gid);
    }
}
