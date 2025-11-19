# Automatic Shot Detection Notes

## Accepted marker colours for V1

Automatic detection currently looks for **bright, near-white markers** that stand out from the beige paper and black centre of a 10m pistol target. Anything that is very bright and has low saturation works well:

- White pasters or round stickers
- White masking or label tape
- The white back side of the target card
- Bright reflections from lamps on glossy white paper

These guidelines are the copy that should be shown in the "Scan target" UI:

> **How to mark your shots for automatic detection**
>
> * Use white round stickers, white masking tape or any other bright white mark on each hit.
> * Any very bright, whitish surface works as long as it clearly stands out from the beige paper and the black centre.
> * Avoid beige, brown or very dark markers – they blend into the target and will not be detected reliably.

## Future extension: environment colour markers

The detector has a placeholder for sampling an additional colour from the shooter’s environment (e.g. neon tape on the bench). A future UI flow can allow the user to sample that colour, after which it can be passed to the detector and combined with the white marker mask.
