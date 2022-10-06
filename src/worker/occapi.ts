import { getOcc } from './actions';
import { TopoDS_Shape } from 'opencascade.js';
import { IAllOperatorFunc, IOperatorArg } from './types';
import { hashCode, toRad } from './utils';
import { IJCadContent, Parts } from '../_interface/jcad';
import { IBox } from '../_interface/box';
import { ICylinder } from '../_interface/cylinder';
import { ISphere } from '../_interface/sphere';
import { ICone } from '../_interface/cone';
import { ICut } from '../_interface/cut';

const SHAPE_CACHE = new Map<string, TopoDS_Shape>();
export function operatorCache<T>(
  name: string,
  ops: (args: T, content: IJCadContent) => TopoDS_Shape | undefined
) {
  return (args: T, content: IJCadContent): TopoDS_Shape | undefined => {
    const hash = `${name}-${hashCode(JSON.stringify(args))}`;
    if (SHAPE_CACHE.has(hash)) {
      return SHAPE_CACHE.get(hash)!;
    } else {
      const shape = ops(args, content);
      if (shape) {
        SHAPE_CACHE.set(hash, shape);
      }
      return shape;
    }
  };
}

function setShapePlacement(
  shape: TopoDS_Shape,
  placement: {
    Position: number[];
    Axis: number[];
    Angle: number;
  }
): TopoDS_Shape {
  const oc = getOcc();
  const trsf = new oc.gp_Trsf_1();

  const ax = new oc.gp_Ax1_2(
    new oc.gp_Pnt_3(0, 0, 0),
    new oc.gp_Dir_4(placement.Axis[0], placement.Axis[1], placement.Axis[2])
  );
  const angle = toRad(placement.Angle);
  trsf.SetRotation_1(ax, angle);
  trsf.SetTranslationPart(
    new oc.gp_Vec_4(
      placement.Position[0],
      placement.Position[1],
      placement.Position[2]
    )
  );
  const loc = new oc.TopLoc_Location_2(trsf);
  shape.Location_2(loc);
  return shape;
}

function _Box(arg: IBox, _: IJCadContent): TopoDS_Shape | undefined {
  const { Length, Width, Height, Placement } = arg;
  const oc = getOcc();
  const box = new oc.BRepPrimAPI_MakeBox_2(Length, Width, Height);
  const shape = box.Shape();
  return setShapePlacement(shape, Placement);
}

function _Cylinder(arg: ICylinder, _: IJCadContent): TopoDS_Shape | undefined {
  const { Radius, Height, Angle, Placement } = arg;
  const oc = getOcc();
  const cylinder = new oc.BRepPrimAPI_MakeCylinder_2(
    Radius,
    Height,
    toRad(Angle)
  );
  const shape = cylinder.Shape();
  return setShapePlacement(shape, Placement);
}

function _Sphere(arg: ISphere, _: IJCadContent): TopoDS_Shape | undefined {
  const { Radius, Angle1, Angle2, Angle3, Placement } = arg;
  const oc = getOcc();
  const sphere = new oc.BRepPrimAPI_MakeSphere_4(
    Radius,
    toRad(Angle1),
    toRad(Angle2),
    toRad(Angle3)
  );
  const shape = sphere.Shape();
  return setShapePlacement(shape, Placement);
}

function _Cone(arg: ICone, _: IJCadContent): TopoDS_Shape | undefined {
  const { Radius1, Radius2, Height, Angle, Placement } = arg;
  const oc = getOcc();
  const cone = new oc.BRepPrimAPI_MakeCone_2(
    Radius1,
    Radius2,
    Height,
    toRad(Angle)
  );
  const shape = cone.Shape();
  return setShapePlacement(shape, Placement);
}

function _Cut(arg: ICut, content: IJCadContent): TopoDS_Shape | undefined {
  const { Placement, Base, Tool } = arg;
  const oc = getOcc();
  const baseObject = content.objects.filter(obj => obj.name === Base);
  const toolObject = content.objects.filter(obj => obj.name === Tool);
  if (baseObject.length === 0 || toolObject.length === 0) {
    return;
  }
  const baseShape = baseObject[0].shape;
  const toolShape = toolObject[0].shape;
  if (
    baseShape &&
    ShapesFactory[baseShape] &&
    toolShape &&
    ShapesFactory[toolShape]
  ) {
    const base = ShapesFactory[baseShape](
      baseObject[0].parameters as IOperatorArg,
      content
    );
    const tool = ShapesFactory[toolShape](
      toolObject[0].parameters as IOperatorArg,
      content
    );
    if (base && tool) {
      const operator = new oc.BRepAlgoAPI_Cut_3(base, tool);
      if (operator.IsDone()) {
        return setShapePlacement(operator.Shape(), Placement);
      }
    }
  }
}

const Box = operatorCache<IBox>('Box', _Box);
const Cylinder = operatorCache<ICylinder>('Cylinder', _Cylinder);
const Sphere = operatorCache<ISphere>('Sphere', _Sphere);
const Cone = operatorCache<ICone>('Cone', _Cone);
// const Cut = operatorCache<ICut>('Cut', _Cut);

export const ShapesFactory: {
  [key in Parts]: IAllOperatorFunc;
} = {
  'Part::Box': Box,
  'Part::Cylinder': Cylinder,
  'Part::Sphere': Sphere,
  'Part::Cone': Cone,
  'Part::Cut': _Cut
};
