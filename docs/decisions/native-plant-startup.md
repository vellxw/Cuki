# A native renderer must not leave the plant area empty

The f820951 iOS simulator capture showed the correct text and positive plant bounds,
but no visible pot. React's error boundary alone does not detect a native GL context
that never becomes ready. The R3F native installation guide also warns that simulator
OpenGL ES behavior may be unreliable: https://r3f.docs.pmnd.rs/getting-started/installation.
That warning is context, not proof of this exact failure's cause.

Preserve the same seed and credited growth stage in a procedural vector alternative
while the GPU renderer starts. A callback from the real soil mesh's onAfterRender
removes the alternative; an error or 7 seconds of foreground startup without a draw
unmounts that GL instance and labels the alternative explicitly. Background time does
not trigger failure. No static image, test-only replacement, account mutation or
reward change is introduced. Inactive canvases use the `never` frameloop rather than
continuing ambient animation.

A draw callback is evidence of command submission, NOT proof that the native layer
presented pixels, and NOT fidelity approval. Native screenshots still need inspection.
Six component tests cover timeout, draw, inactive startup, late callback, unmount and
error recovery. Their graphics child is a test substitute; they do not validate a GPU.
Physical iOS rendering and the exact simulator failure remain to be investigated.
