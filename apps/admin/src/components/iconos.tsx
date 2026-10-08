import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  Add01Icon as Add,
  AlertCircleIcon as AlertCircle,
  Analytics01Icon as Analytics,
  ArrowDataTransferHorizontalIcon as ArrowDataTransferHorizontal,
  ArrowLeft02Icon as ArrowLeft,
  ArrowTurnBackwardIcon as ArrowTurnBackward,
  CameraOff01Icon as CameraOff,
  CheckmarkCircle02Icon as CheckmarkCircle,
  DiscountTag01Icon as DiscountTag,
  GiftIcon as Gift,
  Home01Icon as Home,
  Invoice01Icon as Invoice,
  Layers01Icon as Layers,
  Layout01Icon as Layout,
  Menu01Icon as Menu,
  Money03Icon as Money,
  NoteEditIcon as NoteEdit,
  Search01Icon as Search,
  Settings01Icon as Settings01,
  SquareArrowUpRightIcon as SquareArrowUpRight,
  Tag01Icon as Tag,
  Upload04Icon as Upload,
  UserAdd01Icon as UserAdd,
  UserCircleIcon as UserCircle,
  UserGroupIcon as UserGroup,
  UserMultipleIcon as UserMultiple,
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  CameraIcon as Camera,
  ChartNoAxesColumnIcon as ChartNoAxesColumn,
  Comment01Icon as Comment,
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
 * `strokeWidth` en 1,5, el de hugeicons: es el trazo del handoff de diseño
 * (ADR-143). Con Onest se había subido a 2 porque se veía pálido al lado del
 * texto; con Geist y la tinta del handoff, 1,5 es lo que se dibujó.
 */
function icono(svg: IconSvgElement) {
  return function Icono({ className }: { className?: string }) {
    return <HugeiconsIcon icon={svg} className={className} strokeWidth={1.5} />;
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
export const ResenaIcon = icono(Comment);
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
export const SettingsIcon = icono(Settings01);
export const SparklesIcon = icono(Sparkles);
export const StoreIcon = icono(Store);
export const TagsIcon = icono(Tags);
/** Borrar. Se llamaba `Trash2`; acá hay uno solo. */
export const Trash2Icon = icono(Trash);
export const UsersIcon = icono(Users);
export const UsersRoundIcon = icono(UsersRound);
export const XIcon = icono(X);

// Los del handoff (ADR-143): el sidebar, la barra de arriba y la paleta de comandos.
export const AlertCircleIcon = icono(AlertCircle);
export const AnalyticsIcon = icono(Analytics);
export const ArrowLeftIcon = icono(ArrowLeft);
export const CameraOffIcon = icono(CameraOff);
export const CheckCircleIcon = icono(CheckmarkCircle);
export const DiscountIcon = icono(DiscountTag);
/** Abrir en otra pestaña: «Ver tienda». */
export const ExternalLinkIcon = icono(SquareArrowUpRight);
export const GiftIcon = icono(Gift);
export const HomeIcon = icono(Home);
export const InvoiceIcon = icono(Invoice);
export const LayersIcon = icono(Layers);
export const LayoutIcon = icono(Layout);
export const MenuIcon = icono(Menu);
export const MoneyIcon = icono(Money);
export const NoteEditIcon = icono(NoteEdit);
export const PlusIcon = icono(Add);
/** La tecla Enter en la paleta de comandos. */
export const ReturnIcon = icono(ArrowTurnBackward);
export const SearchIcon = icono(Search);
/** Cambiar de tienda. */
export const SwitchIcon = icono(ArrowDataTransferHorizontal);
export const TagIcon = icono(Tag);
export const UploadIcon = icono(Upload);
export const UserAddIcon = icono(UserAdd);
export const UserCircleIcon = icono(UserCircle);
export const UserGroupIcon = icono(UserGroup);
export const UserMultipleIcon = icono(UserMultiple);
