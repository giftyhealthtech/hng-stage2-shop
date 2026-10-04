-- Run in the Supabase SQL editor after products-table.sql.

create table if not exists public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null check (length(trim(size)) > 0),
  quantity integer not null check (quantity between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id, size)
);

create index if not exists idx_cart_items_user_id
  on public.cart_items (user_id);

alter table public.cart_items enable row level security;
grant select on public.cart_items to authenticated;
grant insert, update, delete on public.cart_items to authenticated;

drop policy if exists "Users can read their own cart" on public.cart_items;
create policy "Users can read their own cart"
on public.cart_items
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add to their own cart" on public.cart_items;
create policy "Users can add to their own cart"
on public.cart_items
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own cart" on public.cart_items;
create policy "Users can update their own cart"
on public.cart_items
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove from their own cart" on public.cart_items;
create policy "Users can remove from their own cart"
on public.cart_items
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.cart_add_item(
  p_product_id uuid,
  p_size text,
  p_quantity integer default 1
)
returns setof public.cart_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_cart_item public.cart_items%rowtype;
  v_size text := nullif(trim(p_size), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in to sync your cart';
  end if;
  if p_quantity < 1 or p_quantity > 20 or v_size is null then
    raise exception 'Cart quantity must be between 1 and 20 and size is required';
  end if;

  select p.* into v_product
  from public.products as p
  where p.id = p_product_id;

  if not found then
    raise exception 'Product is no longer available';
  end if;
  if cardinality(v_product.sizes) > 0 and not (v_size = any(v_product.sizes)) then
    raise exception 'Selected size is not available';
  end if;

  insert into public.cart_items (user_id, product_id, size, quantity, updated_at)
  values (auth.uid(), p_product_id, v_size, p_quantity, now())
  on conflict (user_id, product_id, size) do update
  set quantity = public.cart_items.quantity + excluded.quantity,
      updated_at = now()
  where public.cart_items.quantity + excluded.quantity <= 20
  returning * into v_cart_item;

  if not found then
    raise exception 'A cart item cannot exceed quantity 20';
  end if;

  return next v_cart_item;
end;
$$;

create or replace function public.cart_set_quantity(
  p_product_id uuid,
  p_size text,
  p_quantity integer
)
returns setof public.cart_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_size text := nullif(trim(p_size), '');
  v_cart_item public.cart_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to sync your cart';
  end if;
  if p_quantity < 0 or p_quantity > 20 or v_size is null then
    raise exception 'Cart quantity must be between 0 and 20 and size is required';
  end if;

  if p_quantity = 0 then
    delete from public.cart_items
    where user_id = auth.uid()
      and product_id = p_product_id
      and size = v_size;
    return;
  end if;

  update public.cart_items
  set quantity = p_quantity,
      updated_at = now()
  where user_id = auth.uid()
    and product_id = p_product_id
    and size = v_size
  returning * into v_cart_item;

  if found then
    return next v_cart_item;
  end if;
end;
$$;

create or replace function public.cart_merge_guest_items(p_items jsonb)
returns setof public.cart_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_size text;
  v_quantity integer;
  v_cart_item public.cart_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to sync your cart';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Guest cart must be an array';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Guest cart must contain no more than 100 lines';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_size := nullif(trim(v_item->>'size'), '');
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity < 1 or v_quantity > 20 or v_size is null then
      raise exception 'Guest cart contains an invalid item';
    end if;

    select * into v_cart_item
    from public.cart_add_item(v_product_id, v_size, v_quantity);
    return next v_cart_item;
  end loop;
end;
$$;

revoke all on function public.cart_add_item(uuid, text, integer) from public, anon;
revoke all on function public.cart_set_quantity(uuid, text, integer) from public, anon;
revoke all on function public.cart_merge_guest_items(jsonb) from public, anon;
grant execute on function public.cart_add_item(uuid, text, integer) to authenticated;
grant execute on function public.cart_set_quantity(uuid, text, integer) to authenticated;
grant execute on function public.cart_merge_guest_items(jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cart_items'
  ) then
    execute 'alter publication supabase_realtime add table public.cart_items';
  end if;
end;
$$;
