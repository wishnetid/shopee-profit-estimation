import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getConnection } from '../../../lib/db';
import { requireStoreId } from '../../../lib/store';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isMutationAuthorized, isSameOriginMutation } = require('../../../lib/dashboard-auth.js') as { isMutationAuthorized: (authorization:string|null,cookie:string|null)=>boolean; isSameOriginMutation:(origin:string|null,expected:string)=>boolean };
const allowed=new Set(['belum_dinilai','restock_layak','rusak','hilang']);
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 if(!isMutationAuthorized(request.headers.get('authorization'),request.headers.get('cookie')))return NextResponse.json({error:'Authentication required.'},{status:401});
 if(!request.headers.get('authorization')&&!isSameOriginMutation(request.headers.get('origin'),request.nextUrl.origin))return NextResponse.json({error:'Cross-origin request rejected.'},{status:403});
 const body=await request.json().catch(()=>null);if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Malformed JSON.'},{status:400});
 const store=await requireStoreId(String(body.storeId??''));if(store.response)return store.response;const noPengembalian=String(body.noPengembalian??'').trim(),noPesanan=String(body.noPesanan??'').trim(),status=String(body.qcStatus??''),note=typeof body.qcNote==='string'?body.qcNote.trim():'';
 if(!noPengembalian||!noPesanan||!allowed.has(status)||note.length>2000)return NextResponse.json({error:'Data QC tidak valid.'},{status:400});
 const c=await getConnection();try{const [source]=await c.execute<Array<RowDataPacket & {no_pengembalian:string}>>('SELECT r.no_pengembalian FROM order_return_refund_raw r JOIN order_return_refund_report_imports i ON i.id=r.order_return_refund_report_import_id WHERE i.store_id=? AND r.no_pengembalian=? AND r.no_pesanan=? LIMIT 1',[store.storeId,noPengembalian,noPesanan]);if(!source.length)return NextResponse.json({error:'Return tidak ditemukan pada RAW toko aktif.'},{status:404});await c.execute('INSERT INTO return_qc_decisions (store_id,no_pengembalian,no_pesanan,qc_status,qc_note) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE no_pesanan=VALUES(no_pesanan),qc_status=VALUES(qc_status),qc_note=VALUES(qc_note)',[store.storeId,noPengembalian,noPesanan,status,note||null]);return NextResponse.json({success:true})}catch{return NextResponse.json({error:'Gagal menyimpan QC.'},{status:500})}finally{c.release()}
}
