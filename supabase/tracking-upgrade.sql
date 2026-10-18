-- Existing projects: run AFTER payment-upgrade.sql (or the updated base schema).
begin;
alter table public.orders add column if not exists cancellation_reason text;
create or replace function public.track_order(token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.order_payment(token) || jsonb_build_object('created_at',o.created_at,'cancellation_reason',o.cancellation_reason,
 'history',coalesce((select jsonb_agg(jsonb_build_object('kind',n.kind,'created_at',n.created_at) order by n.created_at,n.id) from public.notification_events n where n.order_id=o.id),'[]'::jsonb))
 from public.orders o where o.payment_token=token;
$$;
create or replace function public.cancel_order(token uuid,customer_email text,reason text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype;
begin
 if customer_email is null or length(customer_email)>254 or length(coalesce(reason,''))>500 then raise exception 'Check your tracking link, email and cancellation reason.';end if;
 select * into target from public.orders where payment_token=token for update;
 if not found or lower(trim(target.customer->>'email')) is distinct from lower(trim(customer_email)) then raise exception 'Check your tracking link and order email.';end if;
 if target.status='cancelled' then return public.track_order(token);end if;
 if target.status not in ('placed','confirmed') then raise exception 'This order has already been dispatched or delivered. Please contact the owner.';end if;
 update public.orders set status='cancelled',cancellation_reason=coalesce(nullif(trim(reason),''),'Cancelled by customer') where id=target.id;
 return public.track_order(token);
end;$$;
revoke all on function public.track_order(uuid),public.cancel_order(uuid,text,text) from public;
grant execute on function public.track_order(uuid),public.cancel_order(uuid,text,text) to anon,authenticated;
commit;
