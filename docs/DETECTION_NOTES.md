# Automatic Shot Detection Notes

## Accepted marker colours for V1

Automatic detection now looks for **either bright, near-white markers or any saturated colour that is clearly different from the beige paper and black centre** of a 10m pistol target. The guiding rule is contrast: anything that the camera can easily distinguish from beige and black will be picked up.

### Reliable options

| Marker idea | Why it works |
| --- | --- |
| White pasters or round stickers | Still the highest-contrast option and the baseline the detector was tuned for. |
| White masking / label tape, or the white back of a target card | Provides the same near-white highlight as pasters when you run out of stickers. |
| Neon painter's tape (pink, green, orange) | Highly saturated colours that almost never appear on the target itself, so they read as distinct blobs. |
| Bright sticky notes cut into squares | Easy to find on a shooting bench and available in many neon colours for contrast. |
| A bright table/mat edge pressed over the hole | Many shooters already have a coloured bench mat; sliding a small piece over the impact creates a large colour patch that stands apart from beige/black. |
| Metallic or reflective dots | Reflections act like white highlights and are easy for the detector to isolate. |

### UI copy for "Scan target"

> **How to mark your shots for automatic detection**
>
> * Use white round stickers, white masking tape or any other bright white mark on each hit.
> * If you are out of white markers, cover the hole with something **boldly coloured** (neon pink/green tape, a bright sticky note, or even the edge of a coloured shooting mat) so long as it clearly differs from both the beige paper and the black centre.
> * Avoid beige, brown or very dark markers – they blend into the target and will not be detected reliably.

## Future extension: environment colour markers

The detector has a placeholder for sampling an additional colour from the shooter’s environment (e.g. neon tape on the bench). A future UI flow can allow the user to sample that colour, after which it can be passed to the detector and combined with the white marker mask.
