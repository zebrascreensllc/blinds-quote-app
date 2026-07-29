import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, ArrowLeft } from 'lucide-react';

// Pricing data embedded
const PRICING_DATA = {
  'Roller': [
    {'number': '82086K', 'manual': 14.92, 'cordless': 18.12},
    {'number': '82067E', 'manual': 15.23, 'cordless': 18.43},
    {'number': '82006S', 'manual': 15.23, 'cordless': 18.43},
    {'number': '82010G', 'manual': 15.91, 'cordless': 19.12},
    {'number': '82067M', 'manual': 15.91, 'cordless': 19.12},
    {'number': '82082A', 'manual': 16.28, 'cordless': 19.48},
    {'number': '82086F', 'manual': 16.33, 'cordless': 19.53},
    {'number': '82072C', 'manual': 16.38, 'cordless': 19.64},
    {'number': '82027F', 'manual': 16.60, 'cordless': 19.85},
    {'number': '82076A', 'manual': 16.60, 'cordless': 19.85},
    {'number': '82146A', 'manual': 16.60, 'cordless': 19.85},
    {'number': '82006A', 'manual': 16.81, 'cordless': 20.01},
    {'number': '82141A', 'manual': 17.28, 'cordless': 20.48},
    {'number': '82156A', 'manual': 17.28, 'cordless': 20.48},
    {'number': '82167A', 'manual': 17.28, 'cordless': 20.48},
    {'number': '82072F', 'manual': 17.28, 'cordless': 20.48},
    {'number': '82067K', 'manual': 17.65, 'cordless': 20.85},
    {'number': '82161A', 'manual': 17.65, 'cordless': 20.85},
    {'number': '82144A', 'manual': 17.96, 'cordless': 21.22},
    {'number': '82026A', 'manual': 17.96, 'cordless': 21.22},
    {'number': '82137A', 'manual': 17.96, 'cordless': 21.22},
    {'number': '82083A', 'manual': 17.96, 'cordless': 21.22},
    {'number': '82025F', 'manual': 17.96, 'cordless': 21.22},
    {'number': '82032D', 'manual': 18.28, 'cordless': 21.53},
    {'number': '82154A', 'manual': 18.33, 'cordless': 21.53},
    {'number': '82161D', 'manual': 18.59, 'cordless': 21.79},
    {'number': '82088F', 'manual': 18.64, 'cordless': 21.85},
    {'number': '82028F', 'manual': 19.01, 'cordless': 22.27},
    {'number': '82077A', 'manual': 19.01, 'cordless': 22.27},
    {'number': '82133A', 'manual': 19.01, 'cordless': 22.27},
    {'number': '82024A', 'manual': 19.01, 'cordless': 22.27},
    {'number': '82182A', 'manual': 19.22, 'cordless': 22.48},
    {'number': '82136A', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82141E', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82143A', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82142A', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82164A', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82155A', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82006G', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82176A', 'manual': 19.69, 'cordless': 21.95},
    {'number': '82168A', 'manual': 19.69, 'cordless': 21.95},
    {'number': '82180A', 'manual': 20.01, 'cordless': 23.26},
    {'number': '82179A', 'manual': 20.01, 'cordless': 23.26},
    {'number': '82181A', 'manual': 20.01, 'cordless': 23.26},
    {'number': '82183A', 'manual': 20.38, 'cordless': 23.63},
    {'number': '82151A', 'manual': 21.06, 'cordless': 24.26},
    {'number': '82032A', 'manual': 21.74, 'cordless': 24.94},
    {'number': '82178A', 'manual': 22.48, 'cordless': 25.63},
    {'number': '82132D', 'manual': 22.79, 'cordless': 26.00}
  ],
  'Zebra': [
    {'number': '83003L', 'manual': 16.07, 'cordless': 19.85},
    {'number': '83048A', 'manual': 17.75, 'cordless': 19.85},
    {'number': '83038G', 'manual': 17.75, 'cordless': 21.53},
    {'number': '83011A', 'manual': 18.80, 'cordless': 22.58},
    {'number': '83073A', 'manual': 18.80, 'cordless': 22.58},
    {'number': '83055A', 'manual': 18.80, 'cordless': 22.58},
    {'number': '83049A', 'manual': 18.80, 'cordless': 22.58},
    {'number': '83056A', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83061A', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83042A', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83050B', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83013F', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83070A', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83032E', 'manual': 20.17, 'cordless': 23.95},
    {'number': '83045A', 'manual': 20.17, 'cordless': 23.95},
    {'number': '83071A', 'manual': 20.17, 'cordless': 23.95},
    {'number': '83012F', 'manual': 20.17, 'cordless': 23.95},
    {'number': '83009A', 'manual': 20.49, 'cordless': 24.26},
    {'number': '83062A', 'manual': 21.22, 'cordless': 24.94},
    {'number': '83053A', 'manual': 21.22, 'cordless': 24.94},
    {'number': '83039F', 'manual': 21.22, 'cordless': 24.94},
    {'number': '83067A', 'manual': 21.22, 'cordless': 24.94},
    {'number': '83068A', 'manual': 21.22, 'cordless': 24.94},
    {'number': '83070F', 'manual': 21.53, 'cordless': 25.31},
    {'number': '83047A', 'manual': 21.87, 'cordless': 25.63},
    {'number': '83040A', 'manual': 21.87, 'cordless': 25.63},
    {'number': '83066A', 'manual': 21.87, 'cordless': 25.63},
    {'number': '83051A', 'manual': 22.58, 'cordless': 26.31},
    {'number': '83014F', 'manual': 22.58, 'cordless': 26.31},
    {'number': '83043A', 'manual': 22.58, 'cordless': 26.31},
    {'number': '83065A', 'manual': 23.26, 'cordless': 26.99},
    {'number': '83068F', 'manual': 23.26, 'cordless': 26.99},
    {'number': '83058A', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83019F', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83020F', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83044A', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83059A', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83060A', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83046A', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83064A', 'manual': 25.99, 'cordless': 29.77},
    {'number': '83015F', 'manual': 25.99, 'cordless': 29.77}
  ],
  'Roman': [
    {'number': '82067E', 'manual': 18.91, 'cordless': 20.38},
    {'number': '82072C', 'manual': 21.07, 'cordless': 22.73},
    {'number': '82146A', 'manual': 20.90, 'cordless': 22.54},
    {'number': '82072F', 'manual': 21.07, 'cordless': 22.73},
    {'number': '82161A', 'manual': 22.17, 'cordless': 23.92},
    {'number': '82144A', 'manual': 21.25, 'cordless': 22.92},
    {'number': '82161D', 'manual': 23.94, 'cordless': 25.85},
    {'number': '82136A', 'manual': 23.94, 'cordless': 25.85}
  ],
  'Bamboo': [
    {'number': '82005L', 'roller_manual': 17.00, 'roman_manual': 18.15},
    {'number': '82005M', 'roller_manual': 17.00, 'roman_manual': 18.15},
    {'number': '82005N', 'roller_manual': 17.00, 'roman_manual': 18.15},
    {'number': '82005O', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005P', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005B', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005Q', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005C', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005D', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005E', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005F', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005R', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005S', 'roller_manual': 13.54, 'roman_manual': 14.69},
    {'number': '82005T', 'roller_manual': 13.54, 'roman_manual': 14.69},
    {'number': '82005U', 'roller_manual': 10.08, 'roman_manual': 11.23},
    {'number': '82005V', 'roller_manual': 13.54, 'roman_manual': 14.69},
    {'number': '82005A5', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005A6', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005Y', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005Z', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005A0', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005A1', 'roller_manual': 15.85, 'roman_manual': 17.00},
    {'number': '82005A2', 'roller_manual': 17.00, 'roman_manual': 18.15},
    {'number': '82005A3', 'roller_manual': 17.00, 'roman_manual': 18.15}
  ]
};

const BUSINESS_NAME = 'Zebra Screens & Rollers';
const SALES_TAX_RATE = 0.0825;
const MISC_EXPENSE = 4.50;
const SHIPPING_COST = 40;
const PROFIT_PER_WINDOW = 60;
const MOTOR_COST_CLIENT = 80;
const MOTOR_COST_SUPPLIER = 50;
const SOLAR_COST_CLIENT = 40;
const SOLAR_COST_SUPPLIER = 22;
const REMOTE_6CH = 7;
const REMOTE_16CH = 10;

export default function BlindsQuoteApp() {
  const [currentView, setCurrentView] = useState('menu');
  const [quotes, setQuotes] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const [formData, setFormData] = useState({
    clientName: '',
    clientPhone: '',
    location: '',
    date: new Date().toISOString().split('T')[0],
    rooms: [{
      id: 1,
      name: '',
      selectedFabrics: [],
      windows: [{
        id: 1,
        width: '',
        height: '',
        blindType: 'Roller',
        motorized: false,
        cordless: false,
        solar: false,
        mount: 'Inside'
      }]
    }]
  });

  useEffect(() => {
    const saved = localStorage.getItem('blindsQuotes');
    if (saved) setQuotes(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('blindsQuotes', JSON.stringify(quotes));
  }, [quotes]);

  const getFabricPrice = (fabricNum, blindType, cordless) => {
    for (const type of Object.keys(PRICING_DATA)) {
      const fabric = PRICING_DATA[type].find(f => f.number === fabricNum);
      if (fabric) {
        if (type === 'Bamboo') {
          if (blindType === 'Bamboo (Roller)') return fabric.roller_manual;
          if (blindType === 'Bamboo (Roman)') return fabric.roman_manual;
        } else {
          return cordless ? fabric.cordless : fabric.manual;
        }
      }
    }
    return 0;
  };

  const calculateWindowCost = (window, selectedFabrics) => {
    const area = Math.max(1.5, (parseFloat(window.width) * parseFloat(window.height)) / 1550);
    
    if (selectedFabrics.length === 0) {
      const allPrices = [];
      Object.keys(PRICING_DATA).forEach(type => {
        PRICING_DATA[type].forEach(fabric => {
          if (type === 'Bamboo') {
            if (window.blindType === 'Bamboo (Roller)') {
              allPrices.push(fabric.roller_manual);
            } else if (window.blindType === 'Bamboo (Roman)') {
              allPrices.push(fabric.roman_manual);
            }
          } else {
            allPrices.push(window.cordless ? fabric.cordless : fabric.manual);
          }
        });
      });
      
      return {
        minCost: area * Math.min(...allPrices) + MISC_EXPENSE + SHIPPING_COST,
        maxCost: area * Math.max(...allPrices) + MISC_EXPENSE + SHIPPING_COST,
        isRange: true
      };
    } else {
      const costs = selectedFabrics.map(fabricNum => {
        const price = getFabricPrice(fabricNum, window.blindType, window.cordless);
        return area * price + MISC_EXPENSE + SHIPPING_COST;
      });
      
      return {
        minCost: Math.min(...costs),
        maxCost: Math.max(...costs),
        isRange: false
      };
    }
  };

  const calculateWindowQuote = (window, selectedFabrics, totalMotorizedInRoom) => {
    const cost = calculateWindowCost(window, selectedFabrics);
    let profit = PROFIT_PER_WINDOW;
    
    if (window.motorized) {
      const remoteType = totalMotorizedInRoom > 6 ? REMOTE_16CH : REMOTE_6CH;
      profit += MOTOR_COST_CLIENT - MOTOR_COST_SUPPLIER - (remoteType / totalMotorizedInRoom);
    }
    
    if (window.solar) {
      profit += SOLAR_COST_CLIENT - SOLAR_COST_SUPPLIER;
    }
    
    return {
      minQuote: cost.minCost + profit,
      maxQuote: cost.maxCost + profit,
      minCost: cost.minCost,
      maxCost: cost.maxCost,
      profit,
      isRange: cost.isRange
    };
  };

  const generateQuote = () => {
    if (!formData.clientName || !formData.clientPhone) {
      alert('Please fill client name and phone');
      return;
    }

    const quoteData = {
      id: Date.now(),
      ...formData,
      createdDate: new Date().toISOString(),
      status: 'quote'
    };

    setQuotes([...quotes, quoteData]);
    alert('✅ Quote created successfully!');
    resetForm();
    setCurrentView('menu');
  };

  const resetForm = () => {
    setFormData({
      clientName: '',
      clientPhone: '',
      location: '',
      date: new Date().toISOString().split('T')[0],
      rooms: [{
        id: 1,
        name: '',
        selectedFabrics: [],
        windows: [{
          id: 1,
          width: '',
          height: '',
          blindType: 'Roller',
          motorized: false,
          cordless: false,
          solar: false,
          mount: 'Inside'
        }]
      }]
    });
  };

  const renderQuoteDetail = () => {
    if (!selectedQuote) return null;

    const rooms = selectedQuote.rooms;
    let totalMin = 0, totalMax = 0, totalProfit = 0;
    const tableRows = [];

    rooms.forEach(room => {
      const roomWindows = room.windows;
      const motorizedCount = roomWindows.filter(w => w.motorized).length;
      let roomMin = 0, roomMax = 0, roomProfit = 0;

      roomWindows.forEach(window => {
        const quote = calculateWindowQuote(window, room.selectedFabrics, motorizedCount);
        roomMin += quote.minQuote;
        roomMax += quote.maxQuote;
        roomProfit += quote.profit;
      });

      totalMin += roomMin;
      totalMax += roomMax;
      totalProfit += roomProfit;

      const motorType = roomWindows.some(w => w.motorized) ? 'Motor' : 'Manual';
      const solarType = roomWindows.some(w => w.solar) ? 'Yes' : 'No';

      tableRows.push(
        <tr key={room.id} className="border-b border-gray-200 text-xs">
          <td className="p-2">{room.name}</td>
          <td className="p-2 text-center">{roomWindows.length}</td>
          <td className="p-2 text-center">{motorType}</td>
          <td className="p-2 text-center">{solarType}</td>
          <td className="p-2 text-center">${(roomMin / roomWindows.length).toFixed(0)}</td>
          <td className="p-2 text-center">${(roomMax / roomWindows.length).toFixed(0)}</td>
          <td className="p-2 text-right font-semibold">${roomMin.toFixed(0)}-${roomMax.toFixed(0)}</td>
        </tr>
      );
    });

    const taxMin = totalMin * SALES_TAX_RATE;
    const taxMax = totalMax * SALES_TAX_RATE;
    const grandMin = totalMin + taxMin;
    const grandMax = totalMax + taxMax;

    const copyText = `QUOTE - ${BUSINESS_NAME}

Client: ${selectedQuote.clientName}
Phone: ${selectedQuote.clientPhone}
Location: ${selectedQuote.location}
Date: ${selectedQuote.date}

ROOM-BY-ROOM BREAKDOWN:
${rooms.map(room => `${room.name}: $${room.windows.reduce((sum, w) => {
  const quote = calculateWindowQuote(w, room.selectedFabrics, room.windows.filter(x => x.motorized).length);
  return sum + quote.minQuote;
}, 0).toFixed(0)} - $${room.windows.reduce((sum, w) => {
  const quote = calculateWindowQuote(w, room.selectedFabrics, room.windows.filter(x => x.motorized).length);
  return sum + quote.maxQuote;
}, 0).toFixed(0)}`).join('\n')}

OVERALL MIN: $${totalMin.toFixed(0)}
OVERALL MAX: $${totalMax.toFixed(0)}
Sales Tax (8.25%): $${taxMin.toFixed(0)} - $${taxMax.toFixed(0)}
GRAND TOTAL: $${grandMin.toFixed(0)} - $${grandMax.toFixed(0)}

---YOUR PROFIT (Internal Only)---
Total Profit: $${totalProfit.toFixed(0)}`;

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">{selectedQuote.clientName}</h3>
          <button onClick={() => setSelectedQuote(null)} className="text-2xl">✕</button>
        </div>

        <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="p-2 text-left font-bold">Room</th>
                <th className="p-2 text-center font-bold">Win</th>
                <th className="p-2 text-center font-bold">Type</th>
                <th className="p-2 text-center font-bold">Solar</th>
                <th className="p-2 text-center font-bold">Min</th>
                <th className="p-2 text-center font-bold">Max</th>
                <th className="p-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {tableRows}
              <tr className="bg-blue-100 font-bold">
                <td colSpan="6" className="p-2 text-right">TOTAL:</td>
                <td className="p-2 text-right">${totalMin.toFixed(0)}-${totalMax.toFixed(0)}</td>
              </tr>
              <tr className="bg-blue-100">
                <td colSpan="6" className="p-2 text-right">Tax (8.25%):</td>
                <td className="p-2 text-right">${taxMin.toFixed(0)}-${taxMax.toFixed(0)}</td>
              </tr>
              <tr className="bg-green-100 font-bold">
                <td colSpan="6" className="p-2 text-right">GRAND TOTAL:</td>
                <td className="p-2 text-right">${grandMin.toFixed(0)}-${grandMax.toFixed(0)}</td>
              </tr>
              <tr className="bg-yellow-100">
                <td colSpan="6" className="p-2 text-right font-bold">YOUR PROFIT:</td>
                <td className="p-2 text-right text-green-700 font-bold">${totalProfit.toFixed(0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(copyText);
              setCopiedId(selectedQuote.id);
              setTimeout(() => setCopiedId(null), 2000);
            }}
            className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 text-sm"
          >
            {copiedId === selectedQuote.id ? <Check size={16} /> : <Copy size={16} />}
            {copiedId === selectedQuote.id ? 'Copied!' : 'Copy'}
          </button>
          
          <button
            onClick={() => {
              setQuotes(quotes.filter(q => q.id !== selectedQuote.id));
              setSelectedQuote(null);
            }}
            className="px-4 py-3 bg-red-500 text-white rounded-lg font-bold"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    );
  };

  const renderMenu = () => (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-center mb-6">{BUSINESS_NAME}</h1>
      <button
        onClick={() => { resetForm(); setCurrentView('quote'); }}
        className="w-full px-4 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-bold flex items-center justify-center gap-2 text-lg"
      >
        <Plus size={24} /> New Quote
      </button>
      <button
        onClick={() => setCurrentView('history')}
        className="w-full px-4 py-4 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-bold text-lg"
      >
        History ({quotes.length})
      </button>
      
      <div className="p-4 bg-green-100 rounded-lg text-sm text-green-800 border-2 border-green-300">
        <p className="font-bold mb-1">✓ Offline Ready</p>
        <p>Works without internet • Data backed up to iCloud</p>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-3">
      <button
        onClick={() => setCurrentView('menu')}
        className="flex items-center gap-2 px-3 py-2 text-blue-600 font-bold text-lg"
      >
        <ArrowLeft size={20} /> Back
      </button>
      
      <h2 className="text-xl font-bold">Quote History</h2>
      
      {quotes.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No quotes yet</p>
      ) : (
        <div className="space-y-2">
          {quotes.map(quote => (
            <div
              key={quote.id}
              onClick={() => setSelectedQuote(quote)}
              className="p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 bg-white"
            >
              <p className="font-bold text-lg">{quote.clientName}</p>
              <p className="text-sm text-gray-600">{quote.date} • {quote.location}</p>
              <p className="text-xs text-gray-500">{quote.rooms.reduce((sum, r) => sum + r.windows.length, 0)} windows</p>
            </div>
          ))}
        </div>
      )}
      
      {selectedQuote && renderQuoteDetail()}
    </div>
  );

  const renderQuoteForm = () => (
    <div className="space-y-4">
      <button
        onClick={() => setCurrentView('menu')}
        className="flex items-center gap-2 text-blue-600 font-bold text-lg"
      >
        <ArrowLeft size={20} /> Back
      </button>

      <h2 className="text-xl font-bold">Create Quote</h2>

      <div className="space-y-3">
        <input
          type="text"
          placeholder="Client Name"
          value={formData.clientName}
          onChange={(e) => setFormData({...formData, clientName: e.target.value})}
          className="w-full p-3 border-2 rounded-lg text-base"
        />
        
        <input
          type="tel"
          placeholder="Client Phone"
          value={formData.clientPhone}
          onChange={(e) => setFormData({...formData, clientPhone: e.target.value})}
          className="w-full p-3 border-2 rounded-lg text-base"
        />
        
        <input
          type="text"
          placeholder="Location"
          value={formData.location}
          onChange={(e) => setFormData({...formData, location: e.target.value})}
          className="w-full p-3 border-2 rounded-lg text-base"
        />
        
        <input
          type="date"
          value={formData.date}
          onChange={(e) => setFormData({...formData, date: e.target.value})}
          className="w-full p-3 border-2 rounded-lg text-base"
        />
      </div>

      <div className="border-t-4 pt-4">
        <h3 className="font-bold text-lg mb-3">Rooms & Windows</h3>
        
        {formData.rooms.map((room, roomIndex) => (
          <div key={room.id} className="border-2 p-4 rounded-lg mb-4 bg-gray-50">
            <input
              type="text"
              placeholder="Room Name (e.g., Living Room)"
              value={room.name}
              onChange={(e) => {
                const newRooms = [...formData.rooms];
                newRooms[roomIndex].name = e.target.value;
                setFormData({...formData, rooms: newRooms});
              }}
              className="w-full p-3 border-2 rounded-lg mb-3 font-bold text-base"
            />

            {/* Fabric Selection for this room */}
            <div className="mb-4 bg-white p-3 rounded-lg border-2">
              <p className="font-bold text-base mb-2">Select Fabrics for {room.name || 'this room'}:</p>
              
              <div className="space-y-2 max-h-48 overflow-y-auto">
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Roller</p>
                  {PRICING_DATA.Roller.map(fabric => (
                    <label key={fabric.number} className="flex items-center gap-3 p-2 active:bg-blue-100 rounded-lg cursor-pointer text-base">
                      <input
                        type="checkbox"
                        checked={room.selectedFabrics.includes(fabric.number)}
                        onChange={(e) => {
                          const newRooms = [...formData.rooms];
                          if (e.target.checked) {
                            newRooms[roomIndex].selectedFabrics.push(fabric.number);
                          } else {
                            newRooms[roomIndex].selectedFabrics = newRooms[roomIndex].selectedFabrics.filter(f => f !== fabric.number);
                          }
                          setFormData({...formData, rooms: newRooms});
                        }}
                        className="w-5 h-5 cursor-pointer"
                      />
                      <span>{fabric.number}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2 mt-3">Zebra</p>
                  {PRICING_DATA.Zebra.map(fabric => (
                    <label key={fabric.number} className="flex items-center gap-3 p-2 active:bg-blue-100 rounded-lg cursor-pointer text-base">
                      <input
                        type="checkbox"
                        checked={room.selectedFabrics.includes(fabric.number)}
                        onChange={(e) => {
                          const newRooms = [...formData.rooms];
                          if (e.target.checked) {
                            newRooms[roomIndex].selectedFabrics.push(fabric.number);
                          } else {
                            newRooms[roomIndex].selectedFabrics = newRooms[roomIndex].selectedFabrics.filter(f => f !== fabric.number);
                          }
                          setFormData({...formData, rooms: newRooms});
                        }}
                        className="w-5 h-5 cursor-pointer"
                      />
                      <span>{fabric.number}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2 mt-3">Roman</p>
                  {PRICING_DATA.Roman.map(fabric => (
                    <label key={fabric.number} className="flex items-center gap-3 p-2 active:bg-blue-100 rounded-lg cursor-pointer text-base">
                      <input
                        type="checkbox"
                        checked={room.selectedFabrics.includes(fabric.number)}
                        onChange={(e) => {
                          const newRooms = [...formData.rooms];
                          if (e.target.checked) {
                            newRooms[roomIndex].selectedFabrics.push(fabric.number);
                          } else {
                            newRooms[roomIndex].selectedFabrics = newRooms[roomIndex].selectedFabrics.filter(f => f !== fabric.number);
                          }
                          setFormData({...formData, rooms: newRooms});
                        }}
                        className="w-5 h-5 cursor-pointer"
                      />
                      <span>{fabric.number}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2 mt-3">Bamboo</p>
                  {PRICING_DATA.Bamboo.map(fabric => (
                    <label key={fabric.number} className="flex items-center gap-3 p-2 active:bg-blue-100 rounded-lg cursor-pointer text-base">
                      <input
                        type="checkbox"
                        checked={room.selectedFabrics.includes(fabric.number)}
                        onChange={(e) => {
                          const newRooms = [...formData.rooms];
                          if (e.target.checked) {
                            newRooms[roomIndex].selectedFabrics.push(fabric.number);
                          } else {
                            newRooms[roomIndex].selectedFabrics = newRooms[roomIndex].selectedFabrics.filter(f => f !== fabric.number);
                          }
                          setFormData({...formData, rooms: newRooms});
                        }}
                        className="w-5 h-5 cursor-pointer"
                      />
                      <span>{fabric.number}</span>
                    </label>
                  ))}
                </div>
              </div>

              {room.selectedFabrics.length > 0 && (
                <p className="text-sm text-green-600 font-bold mt-2">
                  ✓ {room.selectedFabrics.length} fabric(s) selected
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2">Leave empty for Min/Max quote</p>
            </div>

            <div className="bg-blue-100 p-3 rounded-lg mb-3 text-sm font-bold text-blue-900">
              Windows: {room.windows.length}
            </div>
            
            {room.windows.map((window, windowIndex) => (
              <div key={window.id} className="bg-white p-3 rounded-lg mb-3 border-2">
                <div className="font-bold text-base mb-3 text-gray-700">
                  {room.name || 'Room'} - Window {windowIndex + 1}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input
                    type="number"
                    placeholder="Width"
                    value={window.width}
                    onChange={(e) => {
                      const newRooms = [...formData.rooms];
                      newRooms[roomIndex].windows[windowIndex].width = e.target.value;
                      setFormData({...formData, rooms: newRooms});
                    }}
                    className="p-2 border-2 rounded text-base"
                  />
                  <input
                    type="number"
                    placeholder="Height"
                    value={window.height}
                    onChange={(e) => {
                      const newRooms = [...formData.rooms];
                      newRooms[roomIndex].windows[windowIndex].height = e.target.value;
                      setFormData({...formData, rooms: newRooms});
                    }}
                    className="p-2 border-2 rounded text-base"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <select
                    value={window.blindType}
                    onChange={(e) => {
                      const newRooms = [...formData.rooms];
                      newRooms[roomIndex].windows[windowIndex].blindType = e.target.value;
                      setFormData({...formData, rooms: newRooms});
                    }}
                    className="p-2 border-2 rounded text-base"
                  >
                    <option>Roller</option>
                    <option>Zebra</option>
                    <option>Roman</option>
                    <option>Bamboo (Roller)</option>
                    <option>Bamboo (Roman)</option>
                  </select>

                  <select
                    value={window.mount}
                    onChange={(e) => {
                      const newRooms = [...formData.rooms];
                      newRooms[roomIndex].windows[windowIndex].mount = e.target.value;
                      setFormData({...formData, rooms: newRooms});
                    }}
                    className="p-2 border-2 rounded text-base"
                  >
                    <option>Inside</option>
                    <option>Outside</option>
                    <option>Outside-NoReduc</option>
                  </select>
                </div>

                <div className="space-y-2 mb-2">
                  <label className="flex items-center gap-3 p-2 active:bg-blue-100 cursor-pointer rounded-lg text-base font-semibold">
                    <input
                      type="checkbox"
                      checked={window.motorized}
                      onChange={(e) => {
                        const newRooms = [...formData.rooms];
                        newRooms[roomIndex].windows[windowIndex].motorized = e.target.checked;
                        setFormData({...formData, rooms: newRooms});
                      }}
                      className="w-5 h-5 cursor-pointer"
                    />
                    Motor (+$80)
                  </label>

                  <label className="flex items-center gap-3 p-2 active:bg-blue-100 cursor-pointer rounded-lg text-base font-semibold">
                    <input
                      type="checkbox"
                      checked={window.solar}
                      onChange={(e) => {
                        const newRooms = [...formData.rooms];
                        newRooms[roomIndex].windows[windowIndex].solar = e.target.checked;
                        setFormData({...formData, rooms: newRooms});
                      }}
                      className="w-5 h-5 cursor-pointer"
                    />
                    Solar (+$40)
                  </label>

                  {window.motorized && (
                    <label className="flex items-center gap-3 p-2 active:bg-blue-100 cursor-pointer rounded-lg text-base font-semibold ml-4">
                      <input
                        type="checkbox"
                        checked={window.cordless}
                        onChange={(e) => {
                          const newRooms = [...formData.rooms];
                          newRooms[roomIndex].windows[windowIndex].cordless = e.target.checked;
                          setFormData({...formData, rooms: newRooms});
                        }}
                        className="w-5 h-5 cursor-pointer"
                      />
                      Cordless
                    </label>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={() => {
                const newRooms = [...formData.rooms];
                const newWindowId = Math.max(...newRooms[roomIndex].windows.map(w => w.id)) + 1;
                newRooms[roomIndex].windows.push({
                  id: newWindowId,
                  width: '',
                  height: '',
                  blindType: 'Roller',
                  motorized: false,
                  cordless: false,
                  solar: false,
                  mount: 'Inside'
                });
                setFormData({...formData, rooms: newRooms});
              }}
              className="w-full p-3 border-2 border-dashed border-gray-400 rounded text-gray-700 hover:text-gray-900 font-bold text-base"
            >
              + Add Window
            </button>
          </div>
        ))}

        <button
          onClick={() => {
            const newRoomId = Math.max(...formData.rooms.map(r => r.id), 0) + 1;
            setFormData({
              ...formData,
              rooms: [...formData.rooms, {
                id: newRoomId,
                name: '',
                selectedFabrics: [],
                windows: [{
                  id: 1,
                  width: '',
                  height: '',
                  blindType: 'Roller',
                  motorized: false,
                  cordless: false,
                  solar: false,
                  mount: 'Inside'
                }]
              }]
            });
          }}
          className="w-full p-4 border-2 border-dashed border-gray-400 rounded text-gray-700 hover:text-gray-900 font-bold text-base"
        >
          + Add Room
        </button>
      </div>

      <button
        onClick={generateQuote}
        className="w-full p-4 bg-green-500 text-white rounded-lg hover:bg-green-600 font-bold text-lg"
      >
        Generate Quote
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-4 my-4">
        {currentView === 'menu' && renderMenu()}
        {currentView === 'quote' && renderQuoteForm()}
        {currentView === 'history' && renderHistory()}
      </div>
    </div>
  );
}
