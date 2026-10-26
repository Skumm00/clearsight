# ClearSight eye classifier: metrics

## Dataset
- Source: Mendeley Data, "Image Dataset on Eye Diseases Classification (Uveitis, Conjunctivitis, Cataract, Eyelid) with Symptoms and SMOTE Validation", https://data.mendeley.com/datasets/n9zp473wfw/1 (DOI 10.17632/n9zp473wfw.2; the file list is served for the latest version, v2). Downloaded anonymously from public file URLs; no credentials used.
- License: CC BY 4.0 (attribution required). Authors: Abu Kowshir Bitto, Marzia Ahmed et al., Daffodil International University.
- The images were scraped from Google searches by the authors (their words), so third-party image rights are unclear. Attribution is needed in the app.
- The five image folders hold 649/544/525/357/223 files, matching the authors' stated PRE-SMOTE counts. So the download contains the original images only and no SMOTE-synthesized copies (the "balanced to 649" set is not in the files). Folder names are not exposed by the API, so I mapped folders to classes by these unique counts. This mapping was not visually verified; spot-check some images per class.
- Total 2,298 images (+2 notebooks, not used).

## Counts and dedupe
Perceptual hash (phash, 64-bit) with Hamming distance <= 6, grouped via union-find across all classes. One image kept per near-duplicate group. Groups that held images with different labels (4 images) were dropped entirely as label noise. Because only one image per group is kept, near-duplicates cannot cross splits.

| Class | Before dedupe | Removed | After dedupe | Train/Val/Test |
|---|---|---|---|---|
| Cataract | 544 | 65 | 479 | 334/71/74 |
| Conjunctivitis | 357 | 19 | 338 | 235/52/51 |
| Eyelid drooping | 525 | 83 | 442 | 311/67/64 |
| Normal | 649 | 15 | 634 | 442/96/96 |
| Uveitis | 223 | 15 | 208 | 147/30/31 |

Total removed: 197 of 2,298. The dataset's own claim of "duplicates removed" did not hold: many near-duplicates remained (Eyelid drooping and Cataract especially).

Split: stratified, group-aware (StratifiedGroupKFold, seed 0), 70/15/15 = 1469/316/316.

## Training
torchvision MobileNetV3-Small, ImageNet weights, new 5-way head, whole network fine-tuned. 224x224; RandomResizedCrop(0.6-1), horizontal flip, rotation 10 deg, ColorJitter. Class-weighted cross-entropy (inverse frequency), AdamW lr 1e-3, cosine schedule, batch 32, device mps. Early stopping on val macro-F1 (patience 4, up to 14 epochs). It ran 13 epochs in 241s; the best-val checkpoint (val macro-F1 0.952) was kept. Hyperparameters were not tuned on the test set. The test set was evaluated once.

## Test results (n=316, one evaluation)
Accuracy 0.959, macro-F1 0.945.

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Cataract | 0.947 | 0.973 | 0.960 | 74 |
| Conjunctivitis | 1.000 | 0.902 | 0.948 | 51 |
| Eyelid drooping | 0.954 | 0.969 | 0.961 | 64 |
| Normal | 1.000 | 0.990 | 0.995 | 96 |
| Uveitis | 0.824 | 0.903 | 0.862 | 31 |

Confusion matrix:

| true \ pred | Cataract | Conjunctivitis | Eyelid drooping | Normal | Uveitis |
|---|---|---|---|---|---|
| Cataract | 72 | 0 | 1 | 0 | 1 |
| Conjunctivitis | 0 | 46 | 1 | 0 | 4 |
| Eyelid drooping | 1 | 0 | 62 | 0 | 1 |
| Normal | 1 | 0 | 0 | 95 | 0 |
| Uveitis | 2 | 0 | 1 | 0 | 28 |

Weakest class: Uveitis (F1 0.86, only 31 test images; 4 of 31 sit alongside 4 Conjunctivitis cases misread as Uveitis; red-eye conditions look alike). Conjunctivitis recall is 0.90.

## ONNX
`clearsight/public/models/eye_classifier.onnx`, 6.1 MB, input "input" [1,3,224,224] float32, output "logits" (order in eye_labels.json). ImageNet normalization (mean/std) must be applied outside the model. Verified on 8 test images: argmax identical, max abs logit difference 2.7e-05.

## Limitations
- Images are scraped web photos (Google search), with unverified labels and no clinical confirmation. Label noise is likely, and some images may be stock photos, illustrations or cropped close-ups.
- Domain gap: real phone selfies differ in lighting, framing, resolution and skin tone from these images. Expect noticeably lower accuracy than reported here.
- The test split is from the same scraped source, and near-duplicates that phash missed (re-crops, edits) may still inflate scores. 95.9% is an optimistic upper bound.
- Small classes: Uveitis has 208 images after dedupe (31 in test), so its metrics have wide uncertainty (a few images move F1 by several points). Per-class test counts are 31-96.
- "Normal" is almost perfectly separated, which may reflect a stylistic difference in how Normal images were collected, not a real signal.
- No calibration, no out-of-distribution class (non-eye input will still get a label), and no demographic analysis.
- This is a screening-style educational demo. It is NOT a medical diagnosis and must not replace an eye professional.


---
# Update: resolution-shortcut audit and retrain (v2)

The sections above describe the first model (v1). It is superseded by v2 below, which is what ships in the app.

## Image size findings (short side in px, all 2,298 raw images)
| Class | n | min | p10 | median | p90 | max | short side <70 px | <224 px |
|---|---|---|---|---|---|---|---|---|
| Cataract | 544 | 57 | 128 | 187 | 305 | 2513 | 8 | 363 |
| Conjunctivitis | 357 | 117 | 205 | 252 | 295 | 557 | 0 | 58 |
| Eyelid drooping | 525 | 53 | 87 | 159 | 191 | 224 | 13 | 524 |
| Normal | 649 | 41 | 47 | 56 | 65 | 89 | 619 | 649 |
| Uveitis | 223 | 44 | 91 | 192 | 413 | 612 | 6 | 131 |

Normal images are tiny crops (median 56 px, 619 of 649 under 70 px, none above 89 px). All other classes are larger. Eyelid drooping tops out at 224 px. So image size and sharpness are a near-perfect proxy for "Normal" in this data. v1's 0.99 Normal F1 cannot be trusted as evidence of eye-health signal. When v1 was forced to a uniform 64 px resolution, accuracy fell from 0.959 to 0.854 and Eyelid drooping F1 fell to 0.76, which confirms it relied partly on resolution.

## v2 training change
Same MobileNetV3-Small, split, dedupe and optimizer as v1. Every training image (all classes, identical probabilities) is first resized to short side 256, then: with p=0.9 randomly downscaled to a short side in 48-224 px and upscaled back; with p=0.3 Gaussian blur (sigma 0.5-2.0); with p=0.5 JPEG re-encode at quality 20-95; then the earlier crop/flip/rotation/color jitter. Early stopping used val macro-F1 on val images forced through 64 px (size-neutral), best epoch kept. 13 epochs, 268s. Test split is identical to v1 (same seed and code).

## v2 vs v1 on the same held-out test set (n=316)
| Test preprocessing | v2 acc | v2 macro-F1 | v1 (old) acc | v1 macro-F1 |
|---|---|---|---|---|
| Resize to 224x224 (as before) | 0.930 | 0.906 | 0.959 | 0.945 |
| Resize short side 224 + center crop, no degradation | 0.953 | 0.933 | 0.962 | 0.95 |
| Forced down to 64x64 then up to 224 | 0.927 | 0.904 | 0.854 | 0.842 |

Per-class F1 under forced 64 px (v2): Cataract 0.95 | Conjunctivitis 0.92 | Eyelid drooping 0.91 | Normal 0.98 | Uveitis 0.77.

Confusion matrix, v2, forced 64 px (rows true, columns predicted):

| true \ pred | Cataract | Conjunctivitis | Eyelid drooping | Normal | Uveitis |
|---|---|---|---|---|---|
| Cataract | 70 | 1 | 1 | 1 | 1 |
| Conjunctivitis | 0 | 46 | 2 | 0 | 3 |
| Eyelid drooping | 2 | 0 | 59 | 1 | 2 |
| Normal | 0 | 0 | 1 | 95 | 0 |
| Uveitis | 2 | 2 | 3 | 1 | 23 |

Weakest class remains Uveitis (about 0.76-0.81 F1 with 31 test images). v2 is a bit worse than v1 on clean images (0.930 vs 0.959 as-is) and much better when resolution is equalized (0.927 vs 0.854). Test results were read after training and no hyperparameters were chosen on the test set. The model files in clearsight/public/models were replaced with v2 (macro-F1 on the size-neutralized test set is 0.904, judged reasonable). v1 files are kept in ml/out_v1/.

## Additional limitations
- Class names are not clinically reliable. Spot-checking showed the "Eyelid drooping" folder mostly holds eyelid lumps (stye/chalazion-like), not ptosis, and the "Uveitis" folder mostly holds red eyes with visible bleeding or redness, not confirmed uveitis. Treat labels as visual categories of the source folders, not diagnoses.
- The size shortcut is mitigated, not proven gone. There are no large, sharp Normal images in the data, so behavior on real phone photos of healthy eyes cannot be tested here. The model may still over-predict a disease class on high-resolution healthy eyes, and Normal's near-perfect score under every preprocessing may reflect other collection differences (cropping, framing, color), not only size. Collecting real phone photos of healthy eyes is needed before trusting Normal.
- Forced-64px evaluation puts every image at the same resolution but does not make them equally distributed (different source blur and cropping remain).
- All other limitations above still apply. This is not a diagnosis.


---
# v3 experiment: Roboflow Eye Dataset + Mendeley (NOT deployed)

Decision: the files in clearsight/public/models stay at v2. v3 artifacts are in ml/out_v3/ (eye_classifier.onnx, eye_labels.json with temperature, model.pt). Reasons are in "Decision" below. Rerun order: prep_v3.py, embed_v3.py, group_v3.py, train_v3.py.

## Datasets and licenses
- Mendeley Data n9zp473wfw (DOI 10.17632/n9zp473wfw.2), CC BY 4.0. 2,298 scraped images, 5 folders.
- Roboflow Universe "Eye Dataset" v1, project yudis-project-bdsbk/eye-dataset-z53sy, https://universe.roboflow.com/yudis-project-bdsbk/eye-dataset-z53sy. License CC BY 4.0 as stated by the Universe page (supplied by the project owner; I did not re-verify it). 14,735 images, 12 classes, already 300x300 stretched, each source exported with 2 flipped/rotated augmented copies (rotation corners are black). Roboflow's own splits were ignored; everything was pooled.
- Both are web-scraped images with unknown per-image rights. Attribution is needed in the app for both.

## Near-duplicate grouping
Roboflow's augmentation hides duplicates well: only 1,037 of 14,735 filenames carry a '<hash>-Copy_<id>' prefix, and rotated copies defeat plain perceptual hashing. I therefore combined: (1) shared filename prefix, (2) flip/crop-robust phash (min Hamming over h/v flips, 64-bit, full image and center 70% crop, threshold 6), and (3) cosine similarity of mean-centered ResNet18 embeddings of the center crop, maximum over h/v flips, threshold 0.70 (calibrated by eye: pairs above about 0.75 are almost always the same photo, 0.6-0.7 mostly different photos). Pairs were merged most-similar-first with a group size cap of 8 to stop chains (an uncapped version merged 8,926 images into one group). Whole groups go to one split. The cap and the loose threshold mean some distinct but similar photos are grouped (over-grouping; conservative for leakage, costs some data), and a few rotated duplicates with low similarity can still slip through (residual leakage possible, unquantified).
- Pooled: 17,033 images in 4,368 groups.
- Within-Roboflow duplicates removed: 8208. Within-Mendeley: 600. Across datasets (a Mendeley image also present in Roboflow): 3075 images removed from 632 mixed groups. So much of Mendeley was also scraped into Roboflow, which also limits independent cross-source testing.
- One representative image kept per group and label (Mendeley copy preferred, otherwise the least-rotated Roboflow copy, i.e. fewest black corners). 407 groups contained images with conflicting labels; each label inside such a group keeps one representative, all in the same split. This is label noise in the sources (or over-grouping of look-alikes).
- Glaucoma dropped (424 images before dedupe). Pinguecula: kept separate (178>=150).

## Final classes (order of logits): Blepharitis, Cataract, Conjunctivitis, Normal, Pinguecula, Pterygium, Stye, Uveitis, Xanthelasma
Mapping: Normal = Roboflow Healthy + Mendeley Normal; Conjunctivitis = Allergic + Bacterial + Viral + Mendeley Conjunctivitis (subtype kept in metadata); Pterygium = Roboflow pterygium. Mendeley "Eyelid drooping" was merged into Blepharitis, NOT Stye: after grouping, about 247 of its 277 groups (89%) share a group with Roboflow Blepharitis images, and only about 30 with Stye (mostly groups that contain both). So that Mendeley folder is largely the same photos Roboflow files under Blepharitis. There is no "Eyelid drooping" class in v3 (the app label list differs from v2).

| Class | After dedupe | of which Roboflow / Mendeley | Train/Val/Test |
|---|---|---|---|
| Blepharitis | 458 | 181 / 277 | 331/63/64 |
| Cataract | 422 | 74 / 348 | 294/61/67 |
| Conjunctivitis | 1355 | 1100 / 255 | 948/204/203 |
| Normal | 719 | 476 / 243 | 511/107/101 |
| Pinguecula | 178 | 178 / 0 | 125/27/26 |
| Pterygium | 475 | 475 / 0 | 331/70/74 |
| Stye | 543 | 543 / 0 | 378/86/79 |
| Uveitis | 296 | 161 / 135 | 207/42/47 |
| Xanthelasma | 280 | 280 / 0 | 194/43/43 |

Split (group-aware, stratified 70/15/15): 3319/703/704.

## Resolution / border / stretch audit (after dedupe)
| Class / source | n | median short side (px) | square images | mean black-corner fraction | sharpness |
|---|---|---|---|---|---|
| Blepharitis / mendeley | 277 | 162 | 0.00 | 0.01 | 4.21 |
| Blepharitis / roboflow | 181 | 300 | 1.00 | 0.21 | 3.98 |
| Cataract / mendeley | 348 | 187 | 0.00 | 0.01 | 3.96 |
| Cataract / roboflow | 74 | 300 | 1.00 | 0.11 | 3.37 |
| Conjunctivitis / mendeley | 255 | 252 | 0.01 | 0.00 | 4.39 |
| Conjunctivitis / roboflow | 1100 | 300 | 1.00 | 0.04 | 4.88 |
| Normal / mendeley | 243 | 58 | 1.00 | 0.00 | 1.90 |
| Normal / roboflow | 476 | 300 | 1.00 | 0.01 | 4.91 |
| Pinguecula / roboflow | 178 | 300 | 1.00 | 0.04 | 3.81 |
| Pterygium / roboflow | 475 | 300 | 1.00 | 0.14 | 4.27 |
| Stye / roboflow | 543 | 300 | 1.00 | 0.16 | 3.99 |
| Uveitis / mendeley | 135 | 211 | 0.01 | 0.01 | 5.22 |
| Uveitis / roboflow | 161 | 300 | 1.00 | 0.13 | 5.21 |
| Xanthelasma / roboflow | 280 | 300 | 1.00 | 0.03 | 2.67 |

Findings: every Roboflow image is 300x300, so within a class "square 300 px" = Roboflow. Mendeley Normal is the tiny low-res crop set (median 58 px, sharpness 1.9 vs 4.9 for Roboflow Normal), so in v1/v2 and in any mixed-source model the Normal class had two very different looks. Black rotation corners appear only in Roboflow and unevenly by class (higher for Stye, Pterygium, Blepharitis, Uveitis, Cataract than for Normal and Conjunctivitis even after choosing the least-rotated copy). Training applies the same rotation-with-black-fill, flips, and 48-224 px down/up-scaling, blur and JPEG jitter to every class. To test for a corner cue I rotated every test image by 12 deg with black fill: accuracy 0.830 (vs 0.821 unrotated), so the model does not appear to rely on corners, though this does not rule out subtler dataset cues.

## Training
MobileNetV3-Small (ImageNet), 224 px squash-resize, class-weighted CE, AdamW 1e-3 cosine, batch 32, MPS. Early stopping on val macro-F1 of 64 px-degraded val images (best 0.803, 18 epochs). Temperature fitted on the val set (as-is plus 64 px logits pooled): T = 1.691; val NLL 0.580 to 0.500. ONNX 6.1 MB, max |ONNX-PyTorch| logit diff 1.0e-05 on 8 images. Test set (n=704) evaluated once, in three preprocessings.

## v3 test results
| Variant | Accuracy | Macro-F1 |
|---|---|---|
| Resize to 224x224 (as-is) | 0.821 | 0.829 |
| Resize short side 224 + center crop, no degradation | 0.831 | 0.839 |
| Forced 64x64 then up to 224 | 0.811 | 0.823 |

Per-class, forced 64 px:

| Class | P | R | F1 | Support |
|---|---|---|---|---|
| Blepharitis | 0.69 | 0.69 | 0.69 | 64 |
| Cataract | 0.91 | 0.94 | 0.93 | 67 |
| Conjunctivitis | 0.85 | 0.73 | 0.79 | 203 |
| Normal | 0.80 | 0.89 | 0.85 | 101 |
| Pinguecula | 0.96 | 1.00 | 0.98 | 26 |
| Pterygium | 0.93 | 0.96 | 0.95 | 74 |
| Stye | 0.75 | 0.75 | 0.75 | 79 |
| Uveitis | 0.47 | 0.57 | 0.51 | 47 |
| Xanthelasma | 0.98 | 0.98 | 0.98 | 43 |

Confusion matrix, forced 64 px (rows true):

| true \ pred | Blepharitis | Cataract | Conjunctivitis | Normal | Pinguecula | Pterygium | Stye | Uveitis | Xanthelasma |
|---|---|---|---|---|---|---|---|---|---|
| Blepharitis | 44 | 0 | 1 | 1 | 0 | 1 | 15 | 2 | 0 |
| Cataract | 0 | 63 | 0 | 3 | 0 | 0 | 0 | 1 | 0 |
| Conjunctivitis | 4 | 1 | 149 | 14 | 1 | 2 | 4 | 27 | 1 |
| Normal | 2 | 4 | 4 | 90 | 0 | 0 | 1 | 0 | 0 |
| Pinguecula | 0 | 0 | 0 | 0 | 26 | 0 | 0 | 0 | 0 |
| Pterygium | 0 | 0 | 2 | 0 | 0 | 71 | 0 | 1 | 0 |
| Stye | 13 | 0 | 6 | 1 | 0 | 0 | 59 | 0 | 0 |
| Uveitis | 1 | 1 | 14 | 2 | 0 | 2 | 0 | 27 | 0 |
| Xanthelasma | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 42 |

As-is per-class F1: Blepharitis 0.74, Cataract 0.93, Conjunctivitis 0.79, Normal 0.85, Pinguecula 0.98, Pterygium 0.95, Stye 0.79, Uveitis 0.47, Xanthelasma 0.95. Weakest: Uveitis (F1 about 0.5, mostly confused with Conjunctivitis, which has 27 of its 203 test images predicted Uveitis), then Blepharitis and Stye (confused with each other). Accuracy by source on the test set (as-is): Roboflow 0.823 (n=520), Mendeley 0.815 (n=184). Conjunctivitis subtype predictions on the test set: {"Allergic Conj": {"Uveitis": 6, "Conjunctivitis": 58, "Pinguecula": 1, "Normal": 4, "Blepharitis": 1, "Stye": 2, "Cataract": 1}, "Conjunctivitis": {"Uveitis": 5, "Pterygium": 1, "Conjunctivitis": 32}, "Bacterial Conj": {"Conjunctivitis": 29, "Blepharitis": 2, "Normal": 2, "Xanthelasma": 2, "Uveitis": 2}, "Viral Conj": {"Stye": 2, "Conjunctivitis": 34, "Uveitis": 11, "Pterygium": 1, "Normal": 6, "Blepharitis": 1}}.

## Cross-source check (most important honesty check)
4 shared classes only (Normal, Cataract, Conjunctivitis, Uveitis), cross-source groups excluded, same recipe, 4-way model, group-aware inner split for early stopping.

| Training data | Test set | n | Acc | Macro-F1 | Per-class recall |
|---|---|---|---|---|---|
| Train Roboflow only, test Mendeley only | same-source held-out, asis | 248 | 0.734 | 0.693 | Normal 0.90, Cataract 0.73, Conjunctivitis 0.70, Uveitis 0.52 |
| Train Roboflow only, test Mendeley only | same-source held-out, forced64 | 248 | 0.754 | 0.706 | Normal 0.85, Cataract 0.73, Conjunctivitis 0.75, Uveitis 0.52 |
| Train Roboflow only, test Mendeley only | OTHER source, asis | 591 | 0.680 | 0.488 | Normal 0.90, Cataract 0.14, Conjunctivitis 0.78, Uveitis 0.13 |
| Train Roboflow only, test Mendeley only | OTHER source, forced64 | 591 | 0.675 | 0.498 | Normal 0.88, Cataract 0.16, Conjunctivitis 0.77, Uveitis 0.16 |
| Train Mendeley only, test Roboflow only | same-source held-out, asis | 85 | 0.859 | 0.732 | Normal 1.00, Cataract 0.33, Conjunctivitis 1.00, Uveitis 0.50 |
| Train Mendeley only, test Roboflow only | same-source held-out, forced64 | 85 | 0.847 | 0.744 | Normal 1.00, Cataract 0.44, Conjunctivitis 0.93, Uveitis 0.50 |
| Train Mendeley only, test Roboflow only | OTHER source, asis | 1718 | 0.466 | 0.335 | Normal 0.17, Cataract 0.58, Conjunctivitis 0.60, Uveitis 0.37 |
| Train Mendeley only, test Roboflow only | OTHER source, forced64 | 1718 | 0.427 | 0.352 | Normal 0.33, Cataract 0.54, Conjunctivitis 0.45, Uveitis 0.47 |

Train sizes: Roboflow-only 1218 images (Cataract only 53, because most Roboflow Cataract overlaps Mendeley and was excluded), Mendeley-only 421. Reading: the models do NOT transfer across sources. Trained on Mendeley and tested on Roboflow, accuracy is about 0.43-0.47 and Normal recall collapses (0.17-0.33), i.e. Mendeley's tiny Normal crops look nothing like Roboflow's healthy faces. Trained on Roboflow and tested on Mendeley, accuracy is about 0.68 but macro-F1 is about 0.49: Cataract and Uveitis recall is 0.13-0.16 while Normal and Conjunctivitis stay high. Cross-source runs have small training sets, so some of the drop is data size, but the gap versus same-source held-out accuracy (0.73-0.86) is large. Conclusion: a substantial part of the in-distribution score reflects source-specific appearance, not transferable disease signal. Real phone photos are a third, different source.

## Normal false-positive check
All 101 held-out Normal test images: {'Blepharitis': 2, 'Cataract': 3, 'Conjunctivitis': 2, 'Normal': 93, 'Pinguecula': 0, 'Pterygium': 0, 'Stye': 1, 'Uveitis': 0, 'Xanthelasma': 0} (as-is); under 64 px forcing: {'Blepharitis': 2, 'Cataract': 4, 'Conjunctivitis': 4, 'Normal': 90, 'Pinguecula': 0, 'Pterygium': 0, 'Stye': 1, 'Uveitis': 0, 'Xanthelasma': 0}. Random 20 held-out Normal images (11 Roboflow, 9 Mendeley), as-is: {'Blepharitis': 1, 'Cataract': 0, 'Conjunctivitis': 0, 'Normal': 19, 'Pinguecula': 0, 'Pterygium': 0, 'Stye': 0, 'Uveitis': 0, 'Xanthelasma': 0}; 64 px: {'Blepharitis': 1, 'Cataract': 1, 'Conjunctivitis': 0, 'Normal': 18, 'Pinguecula': 0, 'Pterygium': 0, 'Stye': 0, 'Uveitis': 0, 'Xanthelasma': 0}. So roughly 8% of held-out Normal images fire some disease class, most often Cataract, Conjunctivitis or Blepharitis. These are in-distribution images; large sharp phone photos of healthy eyes remain untested.

## Confidence and calibration (test, as-is)
- Raw softmax: mean top-1 confidence 0.894 vs accuracy 0.821, ECE 0.073. Histogram of top-1 probability in 10 bins from 0 to 1: [0, 0, 0, 5, 15, 44, 46, 46, 70, 478]. 37% of wrong predictions have confidence above 0.8 (mean confidence when wrong 0.73).
- After temperature scaling (T=1.69, logits divided by T before softmax): mean confidence 0.822, ECE 0.022, histogram [0, 0, 2, 15, 43, 66, 73, 61, 82, 362], 19% of wrong predictions above 0.8. Still overconfident on a share of errors, and this calibration is only valid in-distribution.

## Like-for-like with v2
v2 and v3 have different class sets and test sets, so macro-F1 values are not directly comparable. On the 259 Roboflow-only test images of the 4 shared classes (never seen by v2; logits restricted to Cataract/Conjunctivitis/Normal/Uveitis for both): v2 accuracy 0.429, v3 0.815. This shows v2 does not generalize to Roboflow photos.

## Decision: v3 not deployed
Criterion 1, 64 px-forced macro-F1 at least as good as v2: v3 0.823 vs v2 0.904 (different, harder 9-class task), so NOT met. Criterion 2, cross-source test shows the model is not just identifying the dataset: NOT met (see above). v2 stays in place. v3 is a more diverse model and has the better coverage (Stye, Pterygium, Xanthelasma, Pinguecula), but its numbers do not clear the bar and its cross-source behavior is poor. If the app owner wants v3 anyway, apply softmax(logits / temperature) and note the label list changed.

## v3 limitations
- Scraped web images from two sources, with a lot of overlap between them; label noise is visible (conflicting labels inside near-duplicate groups; folder names such as Mendeley "Uveitis"/"Eyelid drooping" do not match their content; Glaucoma images resemble Cataract).
- Roboflow images are 300x300 stretched (original aspect ratio lost), pre-augmented with rotation black corners. Mendeley Normal is tiny low-res crops. Both are dataset-specific cues; mitigations applied equally to all classes reduce, but cannot remove, them.
- Duplicate grouping is heuristic: over-grouping loses some data and a few rotated duplicates may remain across splits, which would inflate scores.
- Only 4 classes exist in both datasets and Cataract/Uveitis cross-source numbers rest on small counts. Uveitis, Pinguecula (about 26 test images) and Xanthelasma metrics are noisy.
- Still no large sharp phone photos of healthy eyes. The model has no non-eye class.
- Educational demo only, not a medical diagnosis.
