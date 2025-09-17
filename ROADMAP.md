# R3D Roadmap

## **v0.5**

* [x] **Create Shader Include System**
  Implement an internal shader include system to reduce code duplication in built-in shaders. This could be integrated during the compilation phase, either in `glsl_minifier` or a dedicated pre-processing script.

* [ ] **Revamp Forward Rendering**
  The forward rendering pipeline needs to be revised, particularly to support SSAO. For SSAO, we need at least depth and normals **before lighting**.
  The best approach is to compute normals (and other material values by the way) during the **depth pre-pass**, which also provides the depth. After the depth pre-pass, we can compute SSAO and then apply it during the lighting pass, using the normals and material values generated in the pre-pass.

  However, the pre-pass only applies to **opaque rendering**, so we will need a slightly different version of the forward shader for objects that are not pre-passed. This shader will compute normals and material values directly instead of extracting them from the pre-pass like with opaque objects.

  This make the **depth pre-pass mandatory** for opaque forward rendering.

* [ ] **Better SSAO Support**
  Refactor `R3D_End` so that in *forced forward* mode, SSAO can also be applied to opaque objects stored in the forward draw calls array.

* [ ] **Add ‘Light Affect’ Factor for Ambient Occlusion**
  Currently, occlusion (from ORM or SSAO) only affects ambient light (simulated or IBL). Add a factor to control how much direct lighting is influenced too. While this is less physically accurate, it allows better artistic control.
  *Note: Consider splitting this into two separate factors: one per material and another for SSAO globally.*

* [x] **Better Shadow Quality and Performance**
  Shadow rendering can currently be easily simplified and improved

## **v0.6**

* [ ] **Add Support for Custom Screen-Space Shaders (Post-Processing)**
  Allow custom shaders to be used in screen-space for post-processing effects.

* [ ] **Add Support for Custom Material Shaders**
  Allow custom shaders per material. This will likely require a different approach for deferred vs. forward rendering. Deferred mode will probably offer fewer possibilities than forward mode for custom material shaders.

- [ ] **Rework Scene Management for Directional Lights**  
  Currently, shadow projection for directional lights relies on scene bounds defined by `R3D_SetSceneBounds(bounds)`. This function only exists for that purpose, which makes the system unclear and inflexible. It would be better to design a more natural way to handle shadow projection for directional lights.

* [ ] **Better logs**
  Add better logs for initialization, shutdown, loading operations, and failures.

## **v0.7**

* [ ] **Improve Shadow Map Management**
  Instead of using one shadow map per light, implement an internal batching system with a 2D texture array and `Sample2DArray` in shaders.
  *Note: This would remove per-light independent shadow map resolutions.*

* [ ] **Implement Cascaded Shadow Maps (CSM)**
  Add CSM support for directional lights.

* [ ] **Make a Wiki**
  Add wiki pages to the Github repository.

*Note: v0.7 features are still incomplete.*

## **v0.8**

* [ ] **Support for OpenGL ES**
  Likely add support for OpenGL ES.

## **Ideas (Not Planned Yet)**

* [ ] After implementing `Sampler2DArray` for shadow maps, explore using UBOs for lights. Evaluate whether this is more efficient than the current approach.
* [ ] Provide an easy way to configure the number of lights in forward shaders (preferably runtime-configurable).
* [ ] Implement a system to save loaded skyboxes together with their generated irradiance and prefiltered textures for later reloading.
* [ ] Improve support for shadow/transparency interaction (e.g., colored shadows).
