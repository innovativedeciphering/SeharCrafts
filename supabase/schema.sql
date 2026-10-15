-- Run once in the Supabase SQL editor, on a new project.
begin;
create table public.owners (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.owners enable row level security;
create function public.is_owner() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.owners where user_id = auth.uid()); $$;
create table public.products (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 150),
 category text not null, description text not null default '', price numeric(12,2) not null check(price>0),
 sale_price numeric(12,2) check(sale_price>0 and sale_price<price), offer text not null default '',
 images text[] not null check(cardinality(images) between 1 and 8), active boolean not null default true, created_at timestamptz not null default now()
);
create table public.store_settings (id integer primary key check(id=1),store_name text not null default 'Sehar Crafts',currency text not null default 'PKR' check(currency='PKR'),usd_rate numeric check(usd_rate>0),instagram_url text not null default '',facebook_url text not null default '',tiktok_url text not null default '',payment_details text not null default 'Please wait for order confirmation before payment.',delivery_note text not null default 'Pakistan and international delivery available on request. Shipping cost and availability are confirmed before payment.');
insert into public.store_settings(id) values(1);
create table public.owner_settings(id integer primary key check(id=1),notification_email text check(notification_email is null or notification_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
insert into public.owner_settings(id) values(1);
alter table public.owner_settings enable row level security;
create policy owner_settings_read on public.owner_settings for select to authenticated using(public.is_owner());
create policy owner_settings_update on public.owner_settings for update to authenticated using(public.is_owner()) with check(public.is_owner());
grant select,update on public.owner_settings to authenticated;
create table public.testimonials(id uuid primary key default gen_random_uuid(),name text not null,quote text not null,published boolean not null default false);
create sequence public.order_number_seq;
create table public.orders (
 id uuid primary key default gen_random_uuid(),order_number text not null unique default ('SC-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0')),
 customer jsonb not null,items jsonb not null,total numeric(12,2) not null,currency text not null default 'PKR',
 status text not null default 'placed' check(status in ('placed','confirmed','dispatched','delivered','cancelled')),
 payment_status text not null default 'pending' check(payment_status in ('pending','received','refunded')),created_at timestamptz not null default now()
);
create table public.notification_events(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),kind text not null,created_at timestamptz not null default now(),sent_at timestamptz,attempts integer not null default 0,last_error text);
alter table public.products enable row level security;
alter table public.store_settings enable row level security;
alter table public.testimonials enable row level security;
alter table public.orders enable row level security;
alter table public.notification_events enable row level security;
create policy products_read on public.products for select using(active or public.is_owner());
create policy products_owner on public.products for all to authenticated using(public.is_owner()) with check(public.is_owner());
create policy settings_read on public.store_settings for select using(true);
create policy settings_owner on public.store_settings for update to authenticated using(public.is_owner()) with check(public.is_owner());
create policy testimonials_read on public.testimonials for select using(published or public.is_owner());
create policy testimonials_owner on public.testimonials for all to authenticated using(public.is_owner()) with check(public.is_owner());
create policy orders_owner_read on public.orders for select to authenticated using(public.is_owner());
create policy orders_owner_update on public.orders for update to authenticated using(public.is_owner()) with check(public.is_owner());

-- Public receiving details only. Never store wallet PINs or online banking credentials.
alter table public.store_settings
 add column bank_name text not null default '', add column bank_account_title text not null default '',
 add column bank_account_number text not null default '', add column bank_iban text not null default '',
 add column jazzcash_name text not null default '', add column jazzcash_number text not null default '',
 add column easypaisa_name text not null default '', add column easypaisa_number text not null default '',
 add column payment_url text not null default '' check(payment_url='' or payment_url ~ '^https://[^[:space:]]+$'),
 add column cod_enabled boolean not null default false;
alter table public.orders add column payment_method text not null default 'unselected' check(payment_method in ('bank','jazzcash','easypaisa','online','cod','unselected')),
 add column payment_token uuid not null unique default gen_random_uuid();

-- Only the validated RPC can create public orders. Price and order numbers are server generated.
create function public.place_order(customer jsonb,items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare entry jsonb; p public.products%rowtype; lines jsonb:='[]'; amount numeric:=0; qty integer; result public.orders%rowtype; settings public.store_settings%rowtype; chosen text;
begin
 select * into settings from public.store_settings where id=1;
 chosen:=coalesce(customer->>'payment_method','cod');
 if chosen not in ('bank','jazzcash','easypaisa','online','cod') then raise exception 'Unknown payment method';end if;
 if (chosen='bank' and (settings.bank_name='' or settings.bank_account_title='' or (settings.bank_account_number='' and settings.bank_iban='')))
 or (chosen='jazzcash' and (settings.jazzcash_name='' or settings.jazzcash_number=''))
 or (chosen='easypaisa' and (settings.easypaisa_name='' or settings.easypaisa_number=''))
 or (chosen='online' and settings.payment_url='') or (chosen='cod' and not settings.cod_enabled)
 then raise exception 'This payment method is not available. Please choose another.';end if;
 if jsonb_typeof(customer) is distinct from 'object' or length(customer::text)>5000 or coalesce(length(trim(customer->>'name')),0) not between 1 and 100 or coalesce(length(customer->>'email'),0) not between 3 and 254 or (customer->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or coalesce(length(customer->>'phone'),0) not between 5 and 30 or coalesce(length(customer->>'address'),0) not between 5 and 1000 then raise exception 'Please provide valid contact and delivery details.'; end if;
 if jsonb_typeof(items) is distinct from 'array' then raise exception 'Invalid cart'; end if;
 if jsonb_array_length(items) not between 1 and 30 then raise exception 'Cart must contain 1–30 products'; end if;
 if exists(select 1 from jsonb_array_elements(items) x group by x->>'product_id' having count(*)>1) then raise exception 'Duplicate products'; end if;
 for entry in select * from jsonb_array_elements(items) loop
  if coalesce(entry->>'quantity','') !~ '^[0-9]{1,2}$' then raise exception 'Invalid quantity'; end if;
  qty:=(entry->>'quantity')::integer;
  if qty not between 1 and 20 then raise exception 'Quantity must be 1–20'; end if;
  select * into p from public.products where id=(entry->>'product_id')::uuid and active for share;
  if not found then raise exception 'Product is no longer available'; end if;
  amount:=amount+coalesce(p.sale_price,p.price)*qty;
  lines:=lines||jsonb_build_array(jsonb_build_object('product_id',p.id,'name',p.name,'quantity',qty,'unit_price',coalesce(p.sale_price,p.price)));
 end loop;
 insert into public.orders(customer,items,total,currency,payment_method) values(jsonb_build_object('name',customer->>'name','email',customer->>'email','phone',customer->>'phone','address',customer->>'address','note',left(coalesce(customer->>'note',''),1000)),lines,amount,'PKR',chosen) returning * into result;
 return jsonb_build_object('order_number',result.order_number,'payment_token',result.payment_token,'total',result.total,'currency',result.currency,'status',result.status,'payment_status',result.payment_status,'payment_method',result.payment_method);
end; $$;

-- Possession of an unguessable token reveals only payment metadata, never customer data.
create function public.order_payment(token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('order_number',o.order_number,'total',o.total,'currency',o.currency,'status',o.status,'payment_status',o.payment_status,'payment_method',o.payment_method)
 from public.orders o where o.payment_token=token;
$$;
revoke all on function public.order_payment(uuid) from public;
grant execute on function public.order_payment(uuid) to anon,authenticated;

create function public.delivered_count() returns bigint language sql stable security definer set search_path='' as $$select count(*) from public.orders where status='delivered';$$;
create function public.queue_notification() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_OP='INSERT' then insert into public.notification_events(order_id,kind) values(new.id,'placed');
 elsif new.status is distinct from old.status then insert into public.notification_events(order_id,kind) values(new.id,new.status);
 end if;
 if TG_OP='UPDATE' and new.payment_status is distinct from old.payment_status then insert into public.notification_events(order_id,kind) values(new.id,'payment_'||new.payment_status);end if;
 return new;
end;$$;
create trigger order_notifications after insert or update on public.orders for each row execute function public.queue_notification();
revoke all on function public.place_order(jsonb,jsonb) from public;
grant execute on function public.place_order(jsonb,jsonb) to anon,authenticated;
grant execute on function public.is_owner(),public.delivered_count() to anon,authenticated;
grant select on public.products,public.store_settings,public.testimonials to anon,authenticated;
grant insert,update,delete on public.products,public.testimonials to authenticated;
grant update on public.store_settings to authenticated;
grant select,update on public.orders to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy images_read on storage.objects for select using(bucket_id='product-images');
create policy images_owner on storage.objects for all to authenticated using(bucket_id='product-images' and public.is_owner()) with check(bucket_id='product-images' and public.is_owner());
commit;
