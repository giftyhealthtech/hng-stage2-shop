-- Run after products-table.sql in the Supabase SQL editor.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  address text not null,
  city text not null,
  postal_code text not null,
  country text not null,
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  tax numeric(10, 2) not null check (tax >= 0),
  total numeric(10, 2) not null check (total >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  size text not null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_created_at
  on public.orders (created_at desc);

create index if not exists idx_order_items_order_id
  on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;

create or replace function public.place_order(p_customer jsonb, p_items jsonb)
returns table (order_id uuid, subtotal numeric(10, 2), tax numeric(10, 2), total numeric(10, 2))
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_size text;
  v_order_id uuid := gen_random_uuid();
  v_subtotal numeric(10, 2) := 0;
  v_tax numeric(10, 2);
  v_total numeric(10, 2);
begin
  if jsonb_typeof(p_customer) is distinct from 'object' then
    raise exception 'Customer details are required';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 50 then
    raise exception 'The order must contain between 1 and 50 items';
  end if;

  if coalesce(nullif(trim(p_customer->>'firstName'), ''), '') = ''
     or coalesce(nullif(trim(p_customer->>'lastName'), ''), '') = ''
     or coalesce(nullif(trim(p_customer->>'email'), ''), '') = ''
     or coalesce(nullif(trim(p_customer->>'address'), ''), '') = ''
     or coalesce(nullif(trim(p_customer->>'city'), ''), '') = ''
     or coalesce(nullif(trim(p_customer->>'postalCode'), ''), '') = ''
     or coalesce(nullif(trim(p_customer->>'country'), ''), '') = '' then
    raise exception 'All delivery details are required';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_size := nullif(trim(v_item->>'size'), '');

    if v_quantity < 1 or v_quantity > 20 or v_size is null then
      raise exception 'An order item has invalid quantity or size';
    end if;

    select p.* into v_product
    from public.products as p
    where p.id = v_product_id;

    if not found then
      raise exception 'A product in this order is no longer available';
    end if;

    if cardinality(v_product.sizes) > 0 and not (v_size = any(v_product.sizes)) then
      raise exception 'A selected size is not available';
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_quantity);
  end loop;

  v_tax := round(v_subtotal * 0.08, 2);
  v_total := v_subtotal + v_tax;

  insert into public.orders (
    id, first_name, last_name, email, address, city, postal_code, country, subtotal, tax, total
  ) values (
    v_order_id,
    trim(p_customer->>'firstName'),
    trim(p_customer->>'lastName'),
    trim(p_customer->>'email'),
    trim(p_customer->>'address'),
    trim(p_customer->>'city'),
    trim(p_customer->>'postalCode'),
    trim(p_customer->>'country'),
    v_subtotal,
    v_tax,
    v_total
  );

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_size := trim(v_item->>'size');

    select p.* into v_product
    from public.products as p
    where p.id = v_product_id;

    insert into public.order_items (
      order_id, product_id, product_name, unit_price, size, quantity
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.price, v_size, v_quantity
    );
  end loop;

  return query select v_order_id, v_subtotal, v_tax, v_total;
end;
$$;

revoke all on function public.place_order(jsonb, jsonb) from public;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated;
