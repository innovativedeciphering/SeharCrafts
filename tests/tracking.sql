\set ON_ERROR_STOP on
insert into public.orders(customer,items,total,status,payment_status,payment_token) values
('{"email":"buyer@example.com","name":"Private customer","address":"Private address"}','[]',160,'confirmed','received','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
('{"email":"buyer@example.com"}','[]',100,'dispatched','pending','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
set role anon;
do $$declare tracked jsonb;begin
 tracked:=public.track_order('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 if tracked->>'status'<>'confirmed' or tracked->>'payment_status'<>'received' then raise exception 'Tracking metadata incorrect';end if;
 if tracked ? 'customer' or tracked::text like '%buyer@example.com%' or tracked::text like '%Private address%' then raise exception 'Tracking leaked customer data';end if;
 if public.track_order('cccccccc-cccc-4ccc-8ccc-cccccccccccc') is not null then raise exception 'Unknown token returned data';end if;
 begin perform public.cancel_order('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','wrong@example.com');raise exception 'Wrong email accepted';exception when others then if sqlerrm='Wrong email accepted' then raise;end if;end;
 if public.track_order('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'status'<>'confirmed' then raise exception 'Failed cancellation changed order';end if;
 tracked:=public.cancel_order('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',' BUYER@example.com ','Changed my mind');
 if tracked->>'status'<>'cancelled' or tracked->>'payment_status'<>'received' then raise exception 'Cancellation failed or falsely refunded';end if;
 perform public.cancel_order('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','buyer@example.com');
 begin perform public.cancel_order('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','buyer@example.com');raise exception 'Dispatched cancellation accepted';exception when others then if sqlerrm='Dispatched cancellation accepted' then raise;end if;end;
 if public.track_order('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')->>'status'<>'dispatched' then raise exception 'Dispatched order was changed';end if;
end;$$;
reset role;
do $$begin
 if (select count(*) from public.notification_events n join public.orders o on o.id=n.order_id where o.payment_token='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and n.kind='cancelled')<>1 then raise exception 'Cancellation notification missing or duplicated';end if;
 if (select cancellation_reason from public.orders where payment_token='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'Changed my mind' then raise exception 'Cancellation reason not preserved';end if;
end;$$;
select 'PASS: private tracking, email verification, pre-dispatch cancellation, refund separation, dispatch restriction and idempotent notification' as result;
