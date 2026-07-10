# DRACO / Basis decoders (optional)

Only needed if you add compressed GLB / KTX2 assets via `AssetManager.model()`.

Copy the decoders from the three.js package:

```bash
cp -r node_modules/three/examples/jsm/libs/draco/gltf/ public/draco/
cp -r node_modules/three/examples/jsm/libs/basis/ public/basis/
```

The shipped experience is fully procedural and never touches these paths.
