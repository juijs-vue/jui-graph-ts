// Port of juijs-graph's `src/base/vector.js` ("chart.vector", extend: null).
//
// A standalone 3D vector math helper - no dependency on the rest of the engine (not even
// `util/base.js`), so this is the simplest file in the whole `base/` tree. In the original,
// every method is a closure assigned in the constructor (`this.add = function(...){...}`, etc.);
// ported here as real prototype methods per Phase 0 rule 2, with parameter/method names kept 1:1.

/**
 * A simple immutable-by-convention 3D vector (`x`/`y`/`z`), with basic arithmetic
 * (`add`/`subtract`/`multiply`), a cross product, magnitude, and (despite the name - see its own
 * doc comment) an angle-between-vectors helper (`dotProduct`). Used by the 3D rotation/perspective
 * math elsewhere in this engine (e.g. `base/draw.ts`'s `calculate3d()`). `add`/`subtract`/
 * `multiply`/`crossProduct` all return a NEW `Vector` rather than mutating `this`; `normalize()` is
 * the one exception (see its own doc comment).
 */
export class Vector {
  x: number;
  y: number;
  z: number;

  constructor(x?: number, y?: number, z?: number) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
  }

  /**
   * Returns a new `Vector`, the componentwise sum of `this` and `numberOrVector` - or, when given
   * a plain number, that scalar added to each of `x`/`y`/`z`. Does not mutate `this`.
   */
  add(numberOrVector: number | Vector): Vector {
    if (numberOrVector instanceof Vector) {
      return new Vector(this.x + numberOrVector.x, this.y + numberOrVector.y, this.z + numberOrVector.z);
    }

    return new Vector(this.x + numberOrVector, this.y + numberOrVector, this.z + numberOrVector);
  }

  /**
   * Returns a new `Vector`, the componentwise difference of `this` and `numberOrVector` - or, when
   * given a plain number, that scalar subtracted from each of `x`/`y`/`z`. Does not mutate `this`.
   */
  subtract(numberOrVector: number | Vector): Vector {
    if (numberOrVector instanceof Vector) {
      return new Vector(this.x - numberOrVector.x, this.y - numberOrVector.y, this.z - numberOrVector.z);
    }

    return new Vector(this.x - numberOrVector, this.y - numberOrVector, this.z - numberOrVector);
  }

  /**
   * Returns a new `Vector`, the componentwise product of `this` and `numberOrVector` - or, when
   * given a plain number, that scalar multiplied into each of `x`/`y`/`z`. Does not mutate `this`.
   */
  multiply(numberOrVector: number | Vector): Vector {
    if (numberOrVector instanceof Vector) {
      return new Vector(this.x * numberOrVector.x, this.y * numberOrVector.y, this.z * numberOrVector.z);
    }

    return new Vector(this.x * numberOrVector, this.y * numberOrVector, this.z * numberOrVector);
  }

  /**
   * **Preserved quirk, not fixed**: despite the name, this does NOT return the dot product itself -
   * it returns the ANGLE (in radians) between `this` and `vector`, i.e.
   * `Math.acos(dot / (|this| * |vector|))`. A genuine misnomer in the original (Node/hand-verified:
   * `new Vector(1,0,0).dotProduct(new Vector(0,1,0))` returns `Math.PI / 2`, not `0`, the actual
   * dot product of two perpendicular vectors). Kept exactly, including the name.
   */
  dotProduct(vector: Vector): number {
    const value = this.x * vector.x + this.y * vector.y + this.z * vector.z;
    return Math.acos(value / (this.getMagnitude() * vector.getMagnitude()));
  }

  /** Returns a new `Vector`, the cross product of `this` and `vector`. Does not mutate `this`. */
  crossProduct(vector: Vector): Vector {
    return new Vector(
      this.y * vector.z - this.z * vector.y,
      this.z * vector.x - this.x * vector.z,
      this.x * vector.y - this.y * vector.x
    );
  }

  /**
   * **Preserved quirk**: mutates `this` in place (scales `x`/`y`/`z` down to unit length) and
   * returns `void` - unlike `add`/`subtract`/`multiply`/`crossProduct`, this is not chainable.
   * Kept as-is.
   */
  normalize(): void {
    const mag = this.getMagnitude();

    this.x /= mag;
    this.y /= mag;
    this.z /= mag;
  }

  /** Returns the vector's Euclidean length, `sqrt(x^2 + y^2 + z^2)`. */
  getMagnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
}
