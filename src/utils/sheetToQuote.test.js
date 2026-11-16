// Run with: CI=true npx react-scripts test --watchAll=false src/utils/sheetToQuote.test.js
// "Generate Quote from this Sheet": which existing quote a sheet becomes the
// next version of, for every way a sheet can be made (owner report 2026-11-16).
import assert from 'assert';
import { resolveSheetQuote, buildRoomsFromSheet } from './sheetToQuote';
import { pruneRooms, remapPriceKeysMulti, isBlankGroup } from './quoteGroups';
import { parseUnits } from './formatters';

test('resolveSheetQuote covers pulled, newer, trashed, combined, deleted, blank, renamed and archived cases', () => {
const detect=()=>['Zebra'];
const rooms=()=>[{id:1,name:'Bf nook',fabricInput:'Z1',blindTypes:['Zebra'],windowGroups:[{quantity:'2',width:'34',height:'70',controlType:'Motor'},{quantity:'1',width:'34',height:'35',controlType:'Manual'}]}];
const Q=(id,v,o={})=>({id,lineageId:'L',version:'v'+v,quoteName:'V-FM-q-v'+v,clientName:'Venkat',location:'Flower mound',updatedDate:'2026-10-1'+v,rooms:rooms(),editedPrices:{perWindowPrices:{'1_0':100*v,'1_1':10*v}},...o});
const row=(q,g,w,h,m,o={})=>({sourceQuoteId:q,sourceRoomId:1,sourceGroupIdx:g,clientName:'Venkat',locationBase:'Bf nook',locationIndex:1,totalInLocation:3,width:w,height:h,motor:m,...o});
const pulled6={clientNames:['Venkat'],address:'Flower mound',rows:[row('v1',0,'34 1/8','70','Zigbee'),row('v1',0,'34','70','Zigbee'),row('v1',1,'34','35','Manual')]};
// 1. pulled from newest
let r=resolveSheetQuote(pulled6,[Q('v1',1)],parseUnits); assert.equal(r.how,'pulled'); assert.equal(r.quote.id,'v1');
// 2. pulled from v1 while v2 exists (same layout) -> v2, rows retargeted, v2 prices
r=resolveSheetQuote(pulled6,[Q('v1',1),Q('v2',2)],parseUnits); assert.equal(r.how,'newer'); assert.equal(r.quote.id,'v2'); assert.ok(r.sheet.rows.every(x=>x.sourceQuoteId==='v2')); assert.equal(r.matched,undefined);
let b=buildRoomsFromSheet(r.sheet,r.quote,detect); let pr=pruneRooms(b.rooms,(x,g)=>isBlankGroup(g)); let p=remapPriceKeysMulti(r.quote.editedPrices.perWindowPrices,pr.keyTargets);
assert.deepEqual(Object.values(p).sort(),[20,200,200].sort());
// 3. v2 has a different layout (extra group first) -> relinked by size
const v2b=Q('v2',2,{rooms:[{id:1,name:'Bf nook',fabricInput:'Z1',blindTypes:['Zebra'],windowGroups:[{quantity:'1',width:'20',height:'20',controlType:'Manual'},{quantity:'2',width:'34',height:'70',controlType:'Motor'},{quantity:'1',width:'34',height:'35',controlType:'Manual'}]}],editedPrices:{perWindowPrices:{'1_0':5,'1_1':222,'1_2':22}}});
r=resolveSheetQuote(pulled6,[Q('v1',1),v2b],parseUnits); assert.equal(r.quote.id,'v2'); assert.equal(r.matched,3); assert.deepEqual(r.sheet.rows.map(x=>x.sourceGroupIdx),[1,1,2]);
b=buildRoomsFromSheet(r.sheet,r.quote,detect); pr=pruneRooms(b.rooms,(x,g)=>isBlankGroup(g)); p=remapPriceKeysMulti(r.quote.editedPrices.perWindowPrices,pr.keyTargets);
assert.deepEqual(Object.values(p).sort(),[22,222,222].sort());
// 4. pulled from v2 that was trashed, v1 active -> v1 (newest ACTIVE)
r=resolveSheetQuote({...pulled6,rows:pulled6.rows.map(x=>({...x,sourceQuoteId:'v2'}))},[Q('v1',1),Q('v2',2,{trashedAt:'t'})],parseUnits); assert.equal(r.quote.id,'v1'); assert.equal(r.how,'newer');
// 5. all trashed -> uses trashed source
r=resolveSheetQuote(pulled6,[Q('v1',1,{trashedAt:'t'})],parseUnits); assert.equal(r.quote.id,'v1');
// 6. two versions of ONE job combined -> newest
r=resolveSheetQuote({...pulled6,rows:[...pulled6.rows,row('v2',0,'34','70','Zigbee')]},[Q('v1',1),Q('v2',2)],parseUnits); assert.equal(r.quote.id,'v2');
// 7. two different clients -> none
r=resolveSheetQuote({...pulled6,rows:[...pulled6.rows,row('x',0,'1','1','Manual')]},[Q('v1',1),{id:'x',lineageId:'X',version:'v1',clientName:'Ric',rooms:[]}],parseUnits); assert.equal(r.quote,null); assert.equal(r.reason,'multiple');
// 8. source deleted -> client lookup by name
r=resolveSheetQuote(pulled6,[Q('v9',2,{id:'v9'})],parseUnits); assert.equal(r.how,'client'); assert.equal(r.quote.id,'v9'); assert.equal(r.matched,3);
// 9. blank sheet, address typed differently, only one job for that name -> found
const blank={clientNames:['VENKAT'],address:'Flower Mound, TX',rows:pulled6.rows.map(x=>({...x,sourceQuoteId:null,sourceRoomId:null,sourceGroupIdx:null}))};
r=resolveSheetQuote(blank,[Q('v1',1),Q('v2',2)],parseUnits); assert.equal(r.quote.id,'v2'); assert.equal(r.how,'client');
// 10. same name, two different jobs, address doesn't match either -> none
r=resolveSheetQuote(blank,[Q('v1',1),{...Q('o',1),id:'o',lineageId:'O',location:'Frisco'}],parseUnits); assert.equal(r.quote,null);
// 11. renamed client: sheet says old name, newest version has new name -> newest
r=resolveSheetQuote({...blank,clientNames:['Venkat'],address:'Flower mound'},[Q('v1',1),Q('v2',2,{clientName:'Venkatesh'})],parseUnits); assert.equal(r.quote.id,'v2');
// 12. archived job is not used
r=resolveSheetQuote(blank,[Q('v1',1,{archived:true})],parseUnits); assert.equal(r.quote,null);
// 13. empty sheet / no name
r=resolveSheetQuote({rows:[]},[Q('v1',1)],parseUnits); assert.equal(r.quote,null);

});

test('a quote that already has one room per window (made from an earlier sheet) still matches every window', () => {
  const split = { id: 'q3', lineageId: 'L', version: 'v3', clientName: 'Venkat', location: 'Flower mound', updatedDate: '2026-11-16',
    rooms: [1, 2, 3].map(n => ({ id: n, name: `Bf nook ${n}`, fabricInput: 'Z1', blindTypes: ['Zebra'],
      windowGroups: [{ quantity: '1', width: n === 3 ? '34' : '34 4/16', height: n === 3 ? '35' : '70', controlType: n === 3 ? 'Manual' : 'Motor' }] })),
    editedPrices: { perWindowPrices: { '1_0': 101, '2_0': 102, '3_0': 103 } } };
  const r = (i, w, h, m) => ({ sourceQuoteId: null, clientName: 'Venkat', locationBase: 'Bf nook', locationIndex: i, totalInLocation: 3, width: w, height: h, motor: m });
  const sheet = { clientNames: ['Venkat'], address: 'Flower mound', rows: [r(1, '34 4/16', '70 1/16', 'Zigbee'), r(2, '34 5/16', '70', 'Zigbee'), r(3, '38', '35', 'Manual')] };
  const res = resolveSheetQuote(sheet, [split], parseUnits);
  assert.equal(res.how, 'client');
  assert.equal(res.matched, 3); // window 3 is 4in wider than quoted, but the name is exact
  assert.deepEqual(res.sheet.rows.map(x => x.sourceRoomId), [1, 2, 3]);
  const b = buildRoomsFromSheet(res.sheet, res.quote, () => ['Zebra']);
  assert.deepEqual(b.rooms.map(x => x.name), ['Bf nook 1', 'Bf nook 2', 'Bf nook 3']);
  const pr = pruneRooms(b.rooms, (x, g) => isBlankGroup(g));
  assert.deepEqual(remapPriceKeysMulti(split.editedPrices.perWindowPrices, pr.keyTargets), { '1_0': 101, '2_0': 102, '3_0': 103 });
});
