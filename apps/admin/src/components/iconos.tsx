import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  CameraIcon as Camera,
  ChartNoAxesColumnIcon as ChartNoAxesColumn,
  CheckIcon as Check,
  ChevronDownIcon as ChevronDown,
  ChevronRightIcon as ChevronRight,
  ChevronUpIcon as ChevronUp,
  GalleryVerticalEndIcon as GalleryVerticalEnd,
  HourglassIcon as Hourglass,
  ImageUpIcon as ImageUp,
  LayoutDashboardIcon as LayoutDashboard,
  LayoutTemplateIcon as LayoutTemplate,
  LibraryBigIcon as LibraryBig,
  LogOutIcon as LogOut,
  PackageIcon as Package,
  PanelLeftIcon as PanelLeft,
  PencilIcon as Pencil,
  PercentIcon as Percent,
  ReceiptTextIcon as ReceiptText,
  RepeatIcon as Repeat,
  SettingsIcon as Settings,
  SparklesIcon as Sparkles,
  StoreIcon as Store,
  TagsIcon as Tags,
  TrashIcon as Trash,
  // Los dos que no existen con el nombre que traían de la librería anterior.
  UnfoldMoreIcon as UnfoldMore,
  UsersIcon as Users,
  UsersRoundIcon as UsersRound,
  XIcon as X,
} from '@hugeicons/core-free-icons';

/**
 * Los íconos del Admin.
 *
 * Hugeicons no exporta componentes: exporta **datos** de SVG que se dibujan con
 * `<HugeiconsIcon icon={…} />`. El Admin, en cambio, pasa íconos como
 * componentes por todos lados —`icono: PackageIcon` en el menú, en
 * `PaginaAdmin`, en `BotonDeIcono`— y `Button` los estiliza con `[&_svg]:size-4`.
 *
 * Este módulo hace de puente: envuelve cada dato en un componente con la misma
 * forma de llamada que tenían los de antes, así que ningún sitio de uso cambia.
 * La alternativa era reescribir las veintipico de pantallas y, de paso, perder
 * el patrón de «pasá el ícono como prop» que sostiene el menú y las cabeceras.
 *
 * También es el único lugar donde queda escrito qué ícono es cada cosa: mover el
 * inventario acá es lo que hace que el próximo cambio de librería sea este
 * archivo y no una búsqueda por todo el repositorio.
 *
 * `strokeWidth` fijo en 2: es el trazo con el que se dibujaron estas pantallas,
 * y el de hugeicons por defecto es 1.5, que se ve pálido al lado del texto.
 */
function icono(svg: IconSvgElement) {
  return function Icono({ className }: { className?: string }) {
    return <HugeiconsIcon icon={svg} className={className} strokeWidth={2} />;
  };
}

export const ArrowDownIcon = icono(ArrowDown);
export const ArrowUpIcon = icono(ArrowUp);
export const CameraIcon = icono(Camera);
export const ChartNoAxesColumnIcon = icono(ChartNoAxesColumn);
export const CheckIcon = icono(Check);
export const ChevronDownIcon = icono(ChevronDown);
export const ChevronRightIcon = icono(ChevronRight);
export const ChevronUpIcon = icono(ChevronUp);
/** Abrir un selector. Se llamaba `ChevronsUpDown`; acá el nombre es otro. */
export const ChevronsUpDownIcon = icono(UnfoldMore);
export const GalleryVerticalEndIcon = icono(GalleryVerticalEnd);
export const HourglassIcon = icono(Hourglass);
export const ImageUpIcon = icono(ImageUp);
export const LayoutDashboardIcon = icono(LayoutDashboard);
export const LayoutTemplateIcon = icono(LayoutTemplate);
export const LibraryBigIcon = icono(LibraryBig);
export const LogOutIcon = icono(LogOut);
export const PackageIcon = icono(Package);
export const PanelLeftIcon = icono(PanelLeft);
export const PencilIcon = icono(Pencil);
export const PercentIcon = icono(Percent);
export const ReceiptTextIcon = icono(ReceiptText);
export const RepeatIcon = icono(Repeat);
export const SettingsIcon = icono(Settings);
export const SparklesIcon = icono(Sparkles);
export const StoreIcon = icono(Store);
export const TagsIcon = icono(Tags);
/** Borrar. Se llamaba `Trash2`; acá hay uno solo. */
export const Trash2Icon = icono(Trash);
export const UsersIcon = icono(Users);
export const UsersRoundIcon = icono(UsersRound);
export const XIcon = icono(X);
