/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * Part::Cylinder
 */
export interface ICylinder {
  /**
   * Radius of the cylinder
   */
  Radius: number;
  /**
   * Height of the cylinder
   */
  Height: number;
  /**
   * Angle of the cylinder
   */
  Angle: number;
  /**
   * Placement of the box
   */
  Placement: {
    /**
     * Position of the Placement
     */
    Position: number[];
    /**
     * Axis of the Placement
     */
    Axis: number[];
    /**
     * Angle of the Placement
     */
    Angle: number;
  };
}
