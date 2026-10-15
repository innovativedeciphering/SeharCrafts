-- Existing installations only: run once AFTER the previous schema.
begin;
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
create or replace function public.place_order(customer jsonb,items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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


commit;
