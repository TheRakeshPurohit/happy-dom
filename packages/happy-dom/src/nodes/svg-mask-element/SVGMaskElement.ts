import SVGElement from '../svg-element/SVGElement.js';
import * as PropertySymbol from '../../PropertySymbol.js';
import SVGAnimatedEnumeration from '../../svg/SVGAnimatedEnumeration.js';
import SVGAnimatedLength from '../../svg/SVGAnimatedLength.js';

/**
 * SVG Mask Element.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SVGMaskElement
 */
export default class SVGMaskElement extends SVGElement {
	// Internal properties
	public [PropertySymbol.maskUnits]: SVGAnimatedEnumeration | null = null;
	public [PropertySymbol.maskContentUnits]: SVGAnimatedEnumeration | null = null;
	public [PropertySymbol.x]: SVGAnimatedLength | null = null;
	public [PropertySymbol.y]: SVGAnimatedLength | null = null;
	public [PropertySymbol.width]: SVGAnimatedLength | null = null;
	public [PropertySymbol.height]: SVGAnimatedLength | null = null;

	/**
	 * Returns mask units.
	 *
	 * @returns Mask units.
	 */
	public get maskUnits(): SVGAnimatedEnumeration {
		if (!this[PropertySymbol.maskUnits]) {
			this[PropertySymbol.maskUnits] = new SVGAnimatedEnumeration(
				PropertySymbol.illegalConstructor,
				this[PropertySymbol.window],
				{
					getAttribute: () => this.getAttribute('maskUnits'),
					setAttribute: (value) => this.setAttribute('maskUnits', value),
					values: ['userSpaceOnUse', 'objectBoundingBox'],
					defaultValue: 'userSpaceOnUse'
				}
			);
		}
		return this[PropertySymbol.maskUnits];
	}

	/**
	 * Returns mask content units.
	 *
	 * @returns Mask content units.
	 */
	public get maskContentUnits(): SVGAnimatedEnumeration {
		if (!this[PropertySymbol.maskContentUnits]) {
			this[PropertySymbol.maskContentUnits] = new SVGAnimatedEnumeration(
				PropertySymbol.illegalConstructor,
				this[PropertySymbol.window],
				{
					getAttribute: () => this.getAttribute('maskContentUnits'),
					setAttribute: (value) => this.setAttribute('maskContentUnits', value),
					values: ['userSpaceOnUse', 'objectBoundingBox'],
					defaultValue: 'userSpaceOnUse'
				}
			);
		}
		return this[PropertySymbol.maskContentUnits];
	}

	/**
	 * Returns width.
	 *
	 * @returns Width.
	 */
	public get width(): SVGAnimatedLength {
		if (!this[PropertySymbol.width]) {
			this[PropertySymbol.width] = new SVGAnimatedLength(
				PropertySymbol.illegalConstructor,
				this[PropertySymbol.window],
				{
					getAttribute: () => this.getAttribute('width'),
					setAttribute: (value) => this.setAttribute('width', value)
				}
			);
		}
		return this[PropertySymbol.width];
	}

	/**
	 * Returns height.
	 *
	 * @returns Height.
	 */
	public get height(): SVGAnimatedLength {
		if (!this[PropertySymbol.height]) {
			this[PropertySymbol.height] = new SVGAnimatedLength(
				PropertySymbol.illegalConstructor,
				this[PropertySymbol.window],
				{
					getAttribute: () => this.getAttribute('height'),
					setAttribute: (value) => this.setAttribute('height', value)
				}
			);
		}
		return this[PropertySymbol.height];
	}

	/**
	 * Returns x position.
	 *
	 * @returns X position.
	 */
	public get x(): SVGAnimatedLength {
		if (!this[PropertySymbol.x]) {
			this[PropertySymbol.x] = new SVGAnimatedLength(
				PropertySymbol.illegalConstructor,
				this[PropertySymbol.window],
				{
					getAttribute: () => this.getAttribute('x'),
					setAttribute: (value) => this.setAttribute('x', value)
				}
			);
		}
		return this[PropertySymbol.x];
	}

	/**
	 * Returns y position.
	 *
	 * @returns Y position.
	 */
	public get y(): SVGAnimatedLength {
		if (!this[PropertySymbol.y]) {
			this[PropertySymbol.y] = new SVGAnimatedLength(
				PropertySymbol.illegalConstructor,
				this[PropertySymbol.window],
				{
					getAttribute: () => this.getAttribute('y'),
					setAttribute: (value) => this.setAttribute('y', value)
				}
			);
		}
		return this[PropertySymbol.y];
	}
}
