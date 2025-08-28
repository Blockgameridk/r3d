#include "./common.h"
#include "r3d.h"
#include "raylib.h"
#include "raymath.h"

/* === Resources === */

static R3D_Mesh plane = { 0 };
static R3D_Model dancer = { 0 };
static R3D_Material material = { 0 };

Matrix *CustomMatrices;
Matrix *LocalMatrices;

static Camera3D camera = { 0 };

static int animCount = 0;
static R3D_ModelAnimation* anims = NULL;

static R3D_Light lights[2] = { 0 };

// convert LocalPose to WorldPose from the transform and multiply the parent. 
// note: caching methods should be used. but for this example this more verbose and easier to understand
Matrix GetWorldMatrix(R3D_Model *model,int boneID)
{
    int animFrame = model->animFrame % model->anim->frameCount;
    Transform *localPose = &model->anim->frameLocalPoses[animFrame][boneID];

    Matrix pose = MatrixMultiply(MatrixMultiply(
                                                MatrixScale(localPose->scale.x, localPose->scale.y, localPose->scale.z),
                                                QuaternionToMatrix(localPose->rotation)),
                                                MatrixTranslate(localPose->translation.x, localPose->translation.y, localPose->translation.z));
    //  if we have a parent, get the parent's World transform and apply it
    if (model->bones[boneID].parent != -1)
        pose = MatrixMultiply(pose,GetWorldMatrix(model,model->bones[boneID].parent));
    return (pose);
}

//  from a hierarchical list of transforms, we rebuild the final matrix pose 
void GeneratePoseFromLocal(Matrix *outMatrices,R3D_Model *model)
{
    Matrix scale = MatrixScale(0.01f,0.01f,0.01f);  //  I'm not sure why this is needed 

    for (int boneID=0;boneID<model->boneCount;boneID++)
        outMatrices[boneID] = MatrixMultiply(MatrixMultiply(model->boneOffsets[boneID],GetWorldMatrix(model,boneID)),scale);
}

//  simply copy the matrices and apply the bone offset ( this is the same as what happens internally )
void GeneratePoseFromWorld(Matrix *outMatrices,R3D_Model *model)
{
    int animFrame = model->animFrame % model->anim->frameCount;
    for (int boneID=0;boneID<model->boneCount;boneID++)
    {
        outMatrices[boneID] = MatrixMultiply(model->boneOffsets[boneID],model->anim->frameGlobalPoses[animFrame][boneID]);
    }
}

/* === Example === */

const char* Init(void)
{
    /* --- Initialize R3D with FXAA and disable frustum culling --- */

    R3D_Init(GetScreenWidth(), GetScreenHeight(), R3D_FLAG_FXAA | R3D_FLAG_NO_FRUSTUM_CULLING);

    /* --- Set the application frame rate --- */

    SetTargetFPS(60);

    /* --- Enable post-processing effects --- */

    R3D_SetSSAO(true);
    R3D_SetBloomIntensity(0.03f);
    R3D_SetBloomMode(R3D_BLOOM_ADDITIVE);
    R3D_SetTonemapMode(R3D_TONEMAP_ACES);

    /* --- Set background and ambient lighting colors --- */

    R3D_SetBackgroundColor(BLACK);
    R3D_SetAmbientColor((Color) { 7, 7, 7, 255 });

    /* --- Generate a plane to serve as the ground --- */

    plane = R3D_GenMeshPlane(32, 32, 1, 1, true);

    /* --- Load the 3D model and its default material --- */

    dancer = R3D_LoadModel(RESOURCES_PATH "dancer.glb");

    /* --- Load model animations --- */

    anims = R3D_LoadModelAnimations(RESOURCES_PATH "dancer.glb", &animCount, 60);

    /* --- Create some matrices to work in for custom animation mode */
    CustomMatrices = RL_CALLOC(dancer.boneCount,sizeof(Matrix));
    LocalMatrices = RL_CALLOC(dancer.boneCount,sizeof(Matrix));
    for (int q=0;q<dancer.boneCount;q++)
    {
        CustomMatrices[q] = MatrixIdentity();
        LocalMatrices[q] = CustomMatrices[q];
    }

    material = R3D_GetDefaultMaterial();

    /* --- Generate a checkerboard texture for the material --- */

    Image checked = GenImageChecked(2, 2, 1, 1, (Color) { 20, 20, 20, 255 }, WHITE);
    material.albedo.texture = LoadTextureFromImage(checked);
    UnloadImage(checked);

    SetTextureWrap(material.albedo.texture, TEXTURE_WRAP_REPEAT);

    /* --- Set material properties --- */

    material.orm.roughness = 0.5f;
    material.orm.metalness = 0.5f;

    material.uvScale.x = 64.0f;
    material.uvScale.y = 64.0f;

    /* --- Setup scene lights with shadows --- */

    lights[0] = R3D_CreateLight(R3D_LIGHT_OMNI);
    R3D_SetLightPosition(lights[0], (Vector3) { -10.0f, 25.0f, 0.0f });
    R3D_EnableShadow(lights[0], 4096);
    R3D_SetLightActive(lights[0], true);

    lights[1] = R3D_CreateLight(R3D_LIGHT_OMNI);
    R3D_SetLightPosition(lights[1], (Vector3) { +10.0f, 25.0f, 0.0f });
    R3D_EnableShadow(lights[1], 4096);
    R3D_SetLightActive(lights[1], true);

    /* --- Setup the camera --- */

    camera = (Camera3D) {
        .position = (Vector3) { 0, 2.0f, 3.5f },
        .target = (Vector3) { 0, 1.0f, 1.5f },
        .up = (Vector3) { 0, 1, 0 },
        .fovy = 60,
    };

    /* --- Capture the mouse and let's go! --- */

    DisableCursor();

    return "[r3d] - Animation example";
}

void Update(float delta)
{
    UpdateCamera(&camera, CAMERA_FREE);
    dancer.anim = &anims[0];
    dancer.animFrame++;

    GeneratePoseFromLocal(LocalMatrices,&dancer);
    GeneratePoseFromWorld(CustomMatrices,&dancer);

    R3D_SetLightColor(lights[0], ColorFromHSV(90.0f * (float)GetTime() + 90.0f, 1.0f, 1.0f));
    R3D_SetLightColor(lights[1], ColorFromHSV(90.0f * (float)GetTime() - 90.0f, 1.0f, 1.0f));
}

void Draw(void)
{
    static int frame = 0;

    R3D_Begin(camera);

        R3D_DrawMesh(&plane, &material, MatrixIdentity());

        dancer.animationMode = R3D_ANIM_INTERNAL;
        R3D_DrawModel(&dancer, (Vector3) { 0, 0, 1.5f }, 1.0f);

        //  custom matrices
        dancer.animationMode = R3D_ANIM_CUSTOM;
        dancer.boneOverride = CustomMatrices;
        R3D_DrawModel(&dancer, (Vector3) { 2, 0, 1.5f }, 1.0f);
        dancer.boneOverride = LocalMatrices;
        R3D_DrawModel(&dancer, (Vector3) { -2, 0, 1.5f }, 1.0f);

    R3D_End();

	DrawCredits("Model made by zhuoyi0904");
}

void Close(void)
{
    RL_FREE(CustomMatrices);
    RL_FREE(LocalMatrices);
    R3D_UnloadMesh(&plane);
    R3D_UnloadModel(&dancer, true);
    R3D_UnloadMaterial(&material);
    R3D_Close();
}
