"use client";

import NextImage from "next/image";

type Props = React.ComponentProps<typeof NextImage>;

// next/image default loader yerine, URL'i olduğu gibi döndüren loader.
// Client Component içinde olduğu için RSC sınırını aşmıyor.
const supabaseLoader = ({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) => src;

export default function SupaImage(props: Props) {
  return <NextImage loader={supabaseLoader} unoptimized {...props} />;
}
