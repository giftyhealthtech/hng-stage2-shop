-- Run this in the Supabase SQL editor

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  description text not null,
  category text not null,
  image text,
  sizes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_category
  on public.products (category);

create index if not exists idx_products_name
  on public.products (name);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at
before update on public.products
for each row
execute function public.update_updated_at_column();
alter table public.products enable row level security;
grant select on public.products to anon, authenticated;

create policy "Products are publicly readable"
on public.products
for select
to anon, authenticated
using (true);
-- Optional sample data for testing the storefront before real product uploads
insert into public.products (name, price, description, category, image, sizes)
values
  ('Luna Silk Blouse', 180, 'Fluid ivory silk blouse with sculpted sleeves and a softly draped neckline, designed for elevated everyday dressing.', 'Tops', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80', ARRAY['XS','S','M','L']),
  ('Solene Wrap Dress', 240, 'A minimalist wrap silhouette in weightless crepe with a graceful waistline and subtle movement in every step.', 'Dresses', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80', ARRAY['S','M','L']),
  ('Aster Tailored Coat', 320, 'Precision tailored outerwear with a relaxed shoulder and clean lines, ideal for transitional layering.', 'Outerwear', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80', ARRAY['XS','S','M','L','XL']),
  ('Mila Knit Set', 220, 'Soft knit separates designed for comfort, texture, and a polished silhouette in a refined neutral tone.', 'Knitwear', 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80', ARRAY['S','M','L']),
  ('Nora Leather Tote', 260, 'Structured everyday tote with clean hardware and a soft leather finish that transitions from work to evening.', 'Accessories', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80', ARRAY['One Size'])
on conflict do nothing;
