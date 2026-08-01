import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, ArrowLeft, Search, BarChart3, TrendingUp, Edit2, ChevronDown, ChevronUp } from 'lucide-react';

import { PRICING_DATA } from './data/pricingData';
import { BUSINESS_NAME, SALES_TAX_RATE, getPricingSnapshot, INITIAL_FORM_STATE, INITIAL_TABLE_EDIT_VALUES } from './utils/constants';
import { parseUnits, formatPrice, formatCurrency, formatDate, generateId, deepCopy } from './utils/formatters';
import {
  getWidthSurcharge,
  getHeightSurcharge,
  isFabricValid,
  getFabricPrice,
  getMaxPriceForBlindType,
  calculateGroupCost,
  calculateGroupQuote,
  getBlindTypeFromFabric,
  getBlindTypesFromFabrics,
  getQuoteNamePrefix,
  autoDetectBlindTypes,
  getNextVersion
} from './utils/pricing';


export default function BlindsQuoteApp() {
  const [currentView, setCurrentView] = useState('menu');
  const [quotes, setQuotes] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [expandedPricingDetails, setExpandedPricingDetails] = useState(false);
  const [expandedQuoteTable, setExpandedQuoteTable] = useState(true);
  const [expandedPricingComparison, setExpandedPricingComparison] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClients, setExpandedClients] = useState({});
  const [selectedVersions, setSelectedVersions] = useState(new Set());
  const [editingQuote, setEditingQuote] = useState(null);
  const [lastWidth, setLastWidth] = useState('');
  const [lastHeight, setLastHeight] = useState('');
  // ✅ NEW: Room collapse state
  const [expandedRooms, setExpandedRooms] = useState(new Set());
  // ✅ NEW: Edit pricing table fields
  const [editingTableField, setEditingTableField] = useState(null);
  const [tableEditValues, setTableEditValues] = useState({ perWindowPrices: {}, motorCost: 80, taxRate: 0.0825 });
  // ✅ NEW: Profit details collapse (false = collapsed by default)
  const [expandedProfitDetails, setExpandedProfitDetails] = useState(false);

  const [formData, setFormData] = useState({
    clientName: '',
    clientPhone: '',
    location: '',
    date: new Date().toISOString().split('T')[0],
    rooms: [{
      id: 1,
      name: '',
      fabricInput: '',
      blindTypes: ['Roller'],
      windowGroups: [{
        id: 1,
        quantity: '',
        width: '',
        height: '',
        controlType: 'Manual',
        solar: false,
        mount: 'Inside',
        surchargeOverride: null
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

  const generateQuote = () => {
    if (!formData.clientName || !formData.clientPhone) {
      alert('Please fill client name and phone');
      return;
    }

    // Determine quote name prefix based on ACTUAL FABRICS entered, not selected blind types
    const quoteNamePrefix = getQuoteNamePrefix(formData.rooms, PRICING_DATA);
    
    // Calculate version ONCE
    const newVersion = `v${getNextVersion(formData.clientName, formData.location)}`;
    
    // Create quote name based on fabrics
    const quoteName = `${formData.clientName}-${formData.location}-${quoteNamePrefix}-quote-${newVersion}`;
    
    // Capture pricing snapshot once for all quotes
    const pricingSnapshot = getPricingSnapshot();

    // Create a SINGLE quote (not multiple)
    const quoteData = {
      id: editingQuote ? editingQuote.id : Date.now(),
      quoteName: quoteName,
      version: newVersion,
      ...formData,
      pricing: pricingSnapshot,
      createdDate: editingQuote ? editingQuote.createdDate : new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      status: 'quote'
    };

    if (editingQuote) {
      // Create new version without archiving - keep all versions visible
      setQuotes([...quotes, quoteData]);
      alert(`✅ Quote updated successfully! New version created (${quoteNamePrefix}-${newVersion})`);
    } else {
      setQuotes([...quotes, quoteData]);
      alert(`✅ Quote created successfully!\n\n${quoteNamePrefix.toUpperCase()}`);
    }

    resetForm();
    setEditingQuote(null);
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
        fabricInput: '',
        blindTypes: ['Roller'],
        windowGroups: [{
          id: 1,
          quantity: '',
          width: '',
          height: '',
          controlType: 'Manual',
          solar: false,
          mount: 'Inside',
          surchargeOverride: null
        }]
      }]
    });
  };

  const loadQuoteForEdit = (quote) => {
    try {
      // Ensure rooms have proper structure
      const rooms = (quote.rooms || []).map(room => ({
        ...room,
        id: room.id || 1,
        name: room.name || '',
        fabricInput: room.fabricInput || '',
        blindTypes: Array.isArray(room.blindTypes) ? room.blindTypes : ['Roller'],
        windowGroups: (room.windowGroups || []).map(g => ({
          ...g,
          id: g.id || 1,
          quantity: g.quantity || '',
          width: g.width || '',
          height: g.height || '',
          controlType: g.controlType || 'Manual',
          solar: g.solar || false,
          mount: g.mount || 'Inside',
          surchargeOverride: g.surchargeOverride !== undefined ? g.surchargeOverride : null
        }))
      }));

      setFormData({
        clientName: quote.clientName || '',
        clientPhone: quote.clientPhone || '',
        location: quote.location || '',
        date: quote.date || new Date().toISOString().split('T')[0],
        rooms: rooms.length > 0 ? rooms : [{
          id: 1,
          name: '',
          fabricInput: '',
          blindTypes: ['Roller'],
          windowGroups: [{
            id: 1,
            quantity: '',
            width: '',
            height: '',
            controlType: 'Manual',
            solar: false,
            mount: 'Inside',
            surchargeOverride: null
          }]
        }]
      });
      setEditingQuote(quote);
      setCurrentView('quote');
    } catch (error) {
      console.error('Error loading quote for edit:', error);
      alert('❌ Error loading quote. Please try again.');
    }
  };

  const renderMenu = () => (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#fff', marginBottom: '8px', fontFamily: 'Georgia, serif' }}>ZEBRA</h1>
          <p style={{ color: '#888', letterSpacing: '4px', fontSize: '12px', marginBottom: '16px' }}>SCREENS & ROLLERS</p>
          <div style={{ height: '4px', width: '64px', margin: '0 auto', background: 'linear-gradient(90deg, #d4af37, #f4e4c1)' }}></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <button onClick={() => { resetForm(); setEditingQuote(null); setCurrentView('quote'); }} style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.3s' }} onMouseEnter={e => e.target.style.boxShadow = '0 20px 25px rgba(0,0,0,0.5)'} onMouseLeave={e => e.target.style.boxShadow = 'none'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={28} color="#000" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>New Quote</h3>
                <p style={{ color: '#aaa', fontSize: '14px' }}>Create a new client quote</p>
              </div>
              <div style={{ fontSize: '24px', color: '#666' }}>→</div>
            </div>
          </button>

          <button onClick={() => setCurrentView('history')} style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.3s' }} onMouseEnter={e => e.target.style.boxShadow = '0 20px 25px rgba(0,0,0,0.5)'} onMouseLeave={e => e.target.style.boxShadow = 'none'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Search size={28} color="#000" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>Pull Existing Quote</h3>
                <p style={{ color: '#aaa', fontSize: '14px' }}>Search & view past quotes ({quotes.filter(q => !q.archived).length})</p>
              </div>
              <div style={{ fontSize: '24px', color: '#666' }}>→</div>
            </div>
          </button>

          <button onClick={() => setCurrentView('statistics')} style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.3s' }} onMouseEnter={e => e.target.style.boxShadow = '0 20px 25px rgba(0,0,0,0.5)'} onMouseLeave={e => e.target.style.boxShadow = 'none'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart3 size={28} color="#000" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>Statistics</h3>
                <p style={{ color: '#aaa', fontSize: '14px' }}>View business analytics & insights</p>
              </div>
              <div style={{ fontSize: '24px', color: '#666' }}>→</div>
            </div>
          </button>
        </div>

        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <p style={{ color: '#666', fontSize: '12px' }}>All data is securely stored on your device</p>
        </div>
      </div>
    </div>
  );

  const renderHistory = () => {
    const activeQuotes = quotes.filter(q => !q.archived);
    const groupedByClient = {};
    
    activeQuotes.forEach(quote => {
      const clientKey = `${quote.clientName} - ${quote.location}`;
      if (!groupedByClient[clientKey]) {
        groupedByClient[clientKey] = [];
      }
      groupedByClient[clientKey].push(quote);
    });

    Object.keys(groupedByClient).forEach(client => {
      groupedByClient[client].sort((a, b) => {
        const versionA = parseInt(a.version.replace('v', ''));
        const versionB = parseInt(b.version.replace('v', ''));
        return versionA - versionB;
      });
    });

    const filteredClients = Object.keys(groupedByClient).filter(client =>
      client.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (selectedQuote) {
      return renderQuoteDetail();
    }

    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <button onClick={() => { setCurrentView('menu'); setSearchQuery(''); setSelectedVersions(new Set()); }} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
              <ArrowLeft size={24} color="#aaa" />
            </button>
            <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' }}>Quote History</h2>
          </div>

          <div style={{ marginBottom: '32px', position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '12px', color: '#666' }} size={20} />
            <input
              type="text"
              placeholder="Search by client name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '40px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', borderRadius: '8px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white', fontSize: '16px' }}
            />
          </div>

          {selectedVersions.size > 0 && (
            <button onClick={() => {
              if (window.confirm(`Delete ${selectedVersions.size} version(s)? This cannot be undone.`)) {
                setQuotes(quotes.filter(q => !selectedVersions.has(q.id)));
                setSelectedVersions(new Set());
                alert('✅ Versions deleted successfully!');
              }
            }} style={{ width: '100%', padding: '12px', marginBottom: '16px', borderRadius: '8px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
              Delete {selectedVersions.size} Selected
            </button>
          )}

          {activeQuotes.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
              <p style={{ color: '#888', fontSize: '18px' }}>No quotes created yet</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
              <p style={{ color: '#888', fontSize: '18px' }}>No quotes found for "{searchQuery}"</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredClients.map(clientName => (
                <div key={clientName} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedClients({...expandedClients, [clientName]: !expandedClients[clientName]})}
                    style={{ width: '100%', padding: '16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <p style={{ fontWeight: 'bold', color: '#fff', fontSize: '18px', marginBottom: '4px' }}>{clientName}</p>
                      <p style={{ color: '#888', fontSize: '14px' }}>{groupedByClient[clientName].length} version(s)</p>
                    </div>
                    {expandedClients[clientName] ? <ChevronUp size={24} color="#d4af37" /> : <ChevronDown size={24} color="#d4af37" />}
                  </button>

                  {expandedClients[clientName] && (
                    <div style={{ background: '#1a1a1a', borderTop: '1px solid #444', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {groupedByClient[clientName].map(quote => (
                        <div key={quote.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#2a2a2a', borderRadius: '6px' }}>
                          <input
                            type="checkbox"
                            checked={selectedVersions.has(quote.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedVersions);
                              if (e.target.checked) {
                                newSet.add(quote.id);
                              } else {
                                newSet.delete(quote.id);
                              }
                              setSelectedVersions(newSet);
                            }}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          <button
                            onClick={() => setSelectedQuote(quote)}
                            style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', paddingLeft: '0' }}
                          >
                            <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>{quote.quoteName}</p>
                            <p style={{ color: '#888', fontSize: '12px' }}>{quote.date}</p>
                          </button>
                          <button onClick={() => loadQuoteForEdit(quote)} style={{ padding: '6px', borderRadius: '4px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}>
                            <Edit2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQuoteDetail = () => {
    if (!selectedQuote) return null;

    try {
      const rooms = selectedQuote.rooms;
      const storedPricing = selectedQuote.pricing || null; // Use stored pricing or null (fallback to defaults)
      let totalMin = 0, totalMax = 0, totalProfit = 0;
      
      // Check for invalid fabrics
      const invalidFabrics = [];
      rooms.forEach((room, roomIndex) => {
        const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
        const fabricData = storedPricing?.PRICING_DATA || PRICING_DATA;
        
        fabricNumbers.forEach(fabricNum => {
          if (!isFabricValid(fabricNum, fabricData)) {
            invalidFabrics.push({ fabric: fabricNum, room: room.name || `Room ${roomIndex + 1}` });
          }
        });
      });

      rooms.forEach(room => {
        const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
        const fabricData = storedPricing?.PRICING_DATA || PRICING_DATA;
        
        // Determine blind type from ACTUAL FABRICS entered, not from selected checkbox
        let actualBlindType = (room.blindTypes || ['Roller'])[0]; // Fallback to selected
        
        if (fabricNumbers.length > 0) {
          // Get blind type from first valid fabric
          for (const fabricNum of fabricNumbers) {
            const detectedType = getBlindTypeFromFabric(fabricNum, fabricData);
            if (detectedType) {
              actualBlindType = detectedType;
              break; // Use first valid fabric's type
            }
          }
        }
        
        room.windowGroups.forEach(group => {
          const motorizedCount = room.windowGroups.filter(w => w.controlType === 'Motor').length;
          const q = calculateGroupQuote(group, fabricNumbers, actualBlindType, motorizedCount, storedPricing);
          
          // Safety check for NaN
          if (isNaN(q.minQuote) || isNaN(q.maxQuote)) {
            console.error('NaN detected in quote calculation:', { group, q });
            return;
          }
          
          totalMin += q.minQuote;
          totalMax += q.maxQuote;
          totalProfit += q.profit;
        });
      });

      const taxRate = storedPricing?.SALES_TAX_RATE || SALES_TAX_RATE;
      const taxMin = totalMin * taxRate;
      const taxMax = totalMax * taxRate;
      const grandMin = totalMin + taxMin;
      const grandMax = totalMax + taxMax;

    const copyText = (() => {
      let text = `QUOTE - ${BUSINESS_NAME}\n\nClient: ${selectedQuote.clientName}\nPhone: ${selectedQuote.clientPhone}\nLocation: ${selectedQuote.location}\nDate: ${selectedQuote.date}\n\n`;
      
      let totalWindows = 0;
      
      text += `ROOMS:\n`;
      rooms.forEach(room => {
        let roomWindowCount = 0;
        const controlTypes = new Set();
        
        room.windowGroups.forEach(group => {
          const qty = parseInt(group.quantity) || 1;
          roomWindowCount += qty;
          totalWindows += qty;
          const controlLabel = group.controlType || 'Manual';
          controlTypes.add(controlLabel);
        });
        
        const controlList = Array.from(controlTypes).join(', ');
        text += `${room.name} (${roomWindowCount} windows) - ${controlList}\n`;
      });
      
      text += `\nTOTAL WINDOWS: ${totalWindows}\n\n`;
      
      // Format price - show single if min === max
      const formatTextPrice = (min, max) => {
        const minR = Math.round(min);
        const maxR = Math.round(max);
        return minR === maxR ? `$${minR}` : `$${minR}-$${maxR}`;
      };
      
      text += `OVERALL QUOTE: ${formatTextPrice(totalMin, totalMax)}\n`;
      text += `(Includes width & height surcharges)\n`;
      text += `Sales Tax (8.25%): ${formatTextPrice(taxMin, taxMax)}\n`;
      text += `GRAND TOTAL: ${formatTextPrice(grandMin, grandMax)}`;
      
      return text;
    })();

    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff' }}>{selectedQuote.quoteName}</h3>
            <button onClick={() => setSelectedQuote(null)} style={{ fontSize: '24px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Invalid Fabrics Warning */}
          {invalidFabrics.length > 0 && (
            <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#3a2a2a', border: '2px solid #ff6b6b', padding: '16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#ff6b6b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>⚠️</span>
                INVALID/NEW FABRICS DETECTED
              </p>
              <p style={{ fontSize: '11px', color: '#ffaaaa', marginBottom: '8px', fontStyle: 'italic' }}>
                The following fabrics are not in the system. Quote is using HIGHEST PRICE as fallback:
              </p>
              <div style={{ background: '#2a1a1a', padding: '8px 12px', borderRadius: '4px', borderLeft: '3px solid #ff6b6b' }}>
                {invalidFabrics.map((item, idx) => (
                  <p key={idx} style={{ fontSize: '11px', color: '#ffdddd', margin: '4px 0' }}>
                    • <strong>{item.fabric}</strong> ({item.room})
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Pricing Details Section - Collapsible (default collapsed) */}
          {storedPricing && storedPricing.PROFIT_PER_WINDOW && (
            <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#1a3a3a', border: '1px solid #4a7a6a', padding: '16px' }}>
              <button onClick={() => setExpandedPricingDetails(!expandedPricingDetails)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginBottom: expandedPricingDetails ? '12px' : '0' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#d4af37', marginBottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>📋 PRICING DETAILS (Used for this quote)</span>
                  <span style={{ color: '#888', fontSize: '14px' }}>{expandedPricingDetails ? '▼' : '▶'}</span>
                </p>
              </button>
              
              {expandedPricingDetails && (
                <>
                  <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px', fontStyle: 'italic' }}>✅ All fabric prices, profit margins, and surcharges captured and locked for this quote</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Profit Per Window:</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.PROFIT_PER_WINDOW}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Captured Date:</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>{storedPricing?.CREATED_DATE ? new Date(storedPricing.CREATED_DATE).toLocaleDateString() : selectedQuote?.createdDate ? new Date(selectedQuote.createdDate).toLocaleDateString() : 'N/A'}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Width Surcharge (41-55"):</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.WIDTH_SURCHARGES?.["41-55"] ?? 45}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Height Surcharge (&gt;90"):</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.HEIGHT_SURCHARGE ?? 37}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Motor Cost (Client):</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.MOTOR_COST_CLIENT ?? 80}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Solar Cost (Client):</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.SOLAR_COST_CLIENT ?? 40}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Misc Expense:</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.MISC_EXPENSE ?? 4.50}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Shipping Cost:</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.SHIPPING_COST ?? 42}</p>
                    </div>
                    <div style={{ gridColumn: '1 / -1', paddingTop: '8px', borderTop: '1px solid #4a7a6a' }}>
                      <p style={{ color: '#d4af37', fontSize: '11px', fontWeight: 'bold' }}>📦 Fabric Prices: LOCKED ({storedPricing.PRICING_DATA ? Object.keys(storedPricing.PRICING_DATA).length : 'N/A'} blind types)</p>
                      <p style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>All fabric costs are captured and will not change even if you update prices later</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Current Pricing Comparison */}
          {storedPricing && storedPricing.WIDTH_SURCHARGES && (
            <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#2a2a1a', border: '1px solid #6a6a4a' }}>
              <button onClick={() => setExpandedPricingComparison(!expandedPricingComparison)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#f4e4c1', marginBottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>⚠️ CURRENT PRICING (For comparison)</span>
                  <span style={{ color: '#888', fontSize: '12px' }}>{expandedPricingComparison ? '▼' : '▶'}</span>
                </p>
              </button>
              {expandedPricingComparison && (
              <div style={{ padding: '0 16px 16px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '11px' }}>
                  <div>
                    <p style={{ color: '#888', marginBottom: '4px' }}>Profit Per Window:</p>
                    <p style={{ color: storedPricing.PROFIT_PER_WINDOW === 60 ? '#aaa' : '#ffaa00', fontWeight: 'bold' }}>${60}</p>
                    {storedPricing.PROFIT_PER_WINDOW !== 60 && <p style={{ color: '#ff6666', fontSize: '10px' }}>Changed: ${storedPricing.PROFIT_PER_WINDOW} → $60</p>}
                  </div>
                  <div>
                    <p style={{ color: '#888', marginBottom: '4px' }}>Width Surcharge (41-55"):</p>
                    <p style={{ color: (storedPricing.WIDTH_SURCHARGES?.["41-55"] ?? 45) === 45 ? '#aaa' : '#ffaa00', fontWeight: 'bold' }}>${45}</p>
                    {(storedPricing.WIDTH_SURCHARGES?.["41-55"] ?? 45) !== 45 && <p style={{ color: '#ff6666', fontSize: '10px' }}>Changed: ${storedPricing.WIDTH_SURCHARGES?.["41-55"] ?? 45} → $45</p>}
                  </div>
                  <div>
                    <p style={{ color: '#888', marginBottom: '4px' }}>Height Surcharge (&gt;90"):</p>
                    <p style={{ color: (storedPricing.HEIGHT_SURCHARGE ?? 37) === 37 ? '#aaa' : '#ffaa00', fontWeight: 'bold' }}>${37}</p>
                    {(storedPricing.HEIGHT_SURCHARGE ?? 37) !== 37 && <p style={{ color: '#ff6666', fontSize: '10px' }}>Changed: ${storedPricing.HEIGHT_SURCHARGE ?? 37} → $37</p>}
                  </div>
                </div>
              </div>
              )}
            </div>
          )}

          <div style={{ borderRadius: '8px', marginBottom: '32px', background: '#2a2a2a', border: '1px solid #444' }}>
            <button onClick={() => setExpandedQuoteTable(!expandedQuoteTable)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px', marginBottom: expandedQuoteTable ? '0' : '0' }}>
              <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#d4af37', marginBottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>💰 CURRENT PRICING</span>
                <span style={{ color: '#888', fontSize: '14px' }}>{expandedQuoteTable ? '▼' : '▶'}</span>
              </p>
            </button>
            {expandedQuoteTable && (
            <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#1a1a1a', borderBottom: '1px solid #444' }}>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold', color: '#fff' }}>Room</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#fff' }}>Qty</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#fff' }}>Size</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#fff' }}>Type</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#fff' }}>Per Window</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#fff' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room, roomIdx) => {
                  const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
                  
                  // Determine blind type from ACTUAL FABRICS entered
                  let actualBlindType = (room.blindTypes || ['Roller'])[0];
                  if (fabricNumbers.length > 0) {
                    for (const fabricNum of fabricNumbers) {
                      const detectedType = getBlindTypeFromFabric(fabricNum);
                      if (detectedType) {
                        actualBlindType = detectedType;
                        break;
                      }
                    }
                  }
                  
                  return room.windowGroups.map((group, groupIdx) => {
                    const q = calculateGroupQuote(group, fabricNumbers, actualBlindType, room.windowGroups.filter(w => w.controlType === 'Motor').length, storedPricing);
                    const motorType = group.controlType || 'Manual';
                    const quantity = parseInt(group.quantity) || 1;
                    const perWindowMin = q.baseMinQuote / quantity;
                    
                    // ✅ Check if this room has an edited price from a previous version
                    const displayPrice = selectedQuote.editedPrices?.perWindowPrices[room.id] || perWindowMin;
                    
                    return (
                      <tr key={`${roomIdx}-${groupIdx}`} style={{ borderBottom: '1px solid #444' }}>
                        <td style={{ padding: '8px', color: '#fff' }}>{room.name}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#ccc' }}>{group.quantity}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#ccc' }}>{group.width}x{group.height}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#ccc' }}>{motorType}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: selectedQuote.editedPrices?.perWindowPrices[room.id] ? '#ffcc00' : '#d4af37', fontWeight: '600' }}>
                          {editingTableField === `perWindow-${room.id}` ? (
                            <input
                              type="number"
                              defaultValue={displayPrice}
                              onChange={(e) => {setTableEditValues({...tableEditValues, perWindowPrices: {...tableEditValues.perWindowPrices, [room.id]: parseFloat(e.target.value) || displayPrice}});}}
                              style={{ width: '50px', padding: '2px', borderRadius: '4px', fontSize: '12px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white' }}
                            />
                          ) : (
                            <span>${displayPrice.toFixed(0)}{selectedQuote.editedPrices?.perWindowPrices[room.id] ? ' ✏️' : ''}</span>
                          )}
                          <button
                            onClick={() => {
                              if (editingTableField === `perWindow-${room.id}`) {
                                // Save
                                setEditingTableField(null);
                              } else {
                                // Start editing
                                setEditingTableField(`perWindow-${room.id}`);
                                setTableEditValues({...tableEditValues, perWindowPrices: {...tableEditValues.perWindowPrices, [room.id]: displayPrice}});
                              }
                            }}
                            style={{ padding: '2px 4px', borderRadius: '2px', background: editingTableField === `perWindow-${room.id}` ? '#4ade80' : '#666', color: editingTableField === `perWindow-${room.id}` ? '#000' : '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                          >
                            {editingTableField === `perWindow-${room.id}` ? '✓' : '✏️'}
                          </button>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: selectedQuote.editedPrices?.perWindowPrices[room.id] ? '#ffcc00' : '#fff' }}>
                          ${selectedQuote.editedPrices?.perWindowPrices[room.id] 
                            ? (selectedQuote.editedPrices.perWindowPrices[room.id] * quantity).toFixed(0) 
                            : formatPrice(q.minQuote, q.maxQuote).replace(/\$|,/g, '')}
                        </td>
                      </tr>
                    );
                  });
                })}
                <tr style={{ background: '#1a3a3a', borderTop: '2px solid #d4af37', fontWeight: 'bold' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>TOTAL:</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>{formatPrice(totalMin, totalMax)}</td>
                </tr>
                {/* ✅ NEW: Total Windows Row */}
                <tr style={{ background: '#2a3a2a' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>
                    TOTAL WINDOWS: <span style={{ color: '#fff', fontWeight: 'bold' }}>{(() => {
                      let totalWins = 0;
                      selectedQuote.rooms.forEach(room => {
                        room.windowGroups.forEach(group => {
                          totalWins += parseInt(group.quantity) || 0;
                        });
                      });
                      return totalWins;
                    })()}</span>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}></td>
                </tr>
                {/* ✅ NEW: Motor Cost Breakdown Row */}
                {(() => {
                  let motorCount = 0;
                  selectedQuote.rooms.forEach(room => {
                    room.windowGroups.forEach(group => {
                      if (group.controlType === 'Motor') {
                        motorCount += parseInt(group.quantity) || 0;
                      }
                    });
                  });
                  if (motorCount > 0) {
                    const motorCost = editingTableField === 'motorCost' ? (tableEditValues.motorCost || 80) : (storedPricing?.MOTOR_COST_CLIENT || 80);
                    const totalMotorCost = motorCount * motorCost;
                    return (
                      <tr style={{ background: '#3a2a2a' }}>
                        <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>
                          Motor <span style={{ color: '#ffaa00', fontWeight: 'bold' }}>{motorCount}</span> cost total: <span style={{ color: '#fff', fontWeight: 'bold' }}>${totalMotorCost}</span>
                          <button
                            onClick={() => {
                              if (editingTableField === 'motorCost') {
                                setEditingTableField(null);
                              } else {
                                setEditingTableField('motorCost');
                                setTableEditValues({...tableEditValues, motorCost: motorCost});
                              }
                            }}
                            style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '3px', background: editingTableField === 'motorCost' ? '#4ade80' : '#666', color: editingTableField === 'motorCost' ? '#000' : '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                          >
                            {editingTableField === 'motorCost' ? '✓' : '✏️'}
                          </button>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}></td>
                      </tr>
                    );
                  }
                  return null;
                })()}
                <tr style={{ background: '#2a4a2a' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#aaa', fontSize: '12px' }}>Surcharges (Width + Height):</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#aaa', fontSize: '12px' }}>Included</td>
                </tr>
                <tr style={{ background: '#1a3a3a' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>
                    Tax (8.25%):
                    <button
                      onClick={() => {
                        if (editingTableField === 'tax') {
                          setEditingTableField(null);
                        } else {
                          setEditingTableField('tax');
                          setTableEditValues({...tableEditValues, taxRate: 0.0825});
                        }
                      }}
                      style={{ marginLeft: '8px', padding: '2px 4px', borderRadius: '2px', background: editingTableField === 'tax' ? '#4ade80' : '#666', color: editingTableField === 'tax' ? '#000' : '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                    >
                      {editingTableField === 'tax' ? '✓' : '✏️'}
                    </button>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>{formatPrice(taxMin, taxMax)}</td>
                </tr>
                <tr style={{ background: '#2a5a2a', fontWeight: 'bold' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>GRAND TOTAL:</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>{formatPrice(grandMin, grandMax)}</td>
                </tr>
              </tbody>
            </table>
            </div>
            )}
          </div>

          {/* ✅ NEW: Collapsible Profit Details Section */}
          <div style={{ background: '#3a3a2a', border: '1px solid #6a6a4a', borderRadius: '8px', marginBottom: '24px', overflow: 'hidden' }}>
            <button 
              onClick={() => setExpandedProfitDetails(!expandedProfitDetails)} 
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', color: '#ffd700' }}
            >
              <span>{expandedProfitDetails ? '▼' : '▶'} Profit Details</span>
              <span style={{ fontSize: '13px', color: '#888' }}>Supplier Only</span>
            </button>
            
            {expandedProfitDetails && (
              <div style={{ background: '#2a2a1a', padding: '16px', borderTop: '1px solid #6a6a4a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#1a1a1a', borderRadius: '6px', border: '1px solid #555' }}>
                  <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>YOUR PROFIT:</p>
                  <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#ffd700' }}>${totalProfit.toFixed(0)}</p>
                </div>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '12px', fontStyle: 'italic' }}>💡 This is your internal profit calculation. Not shown to clients.</p>
              </div>
            )}
          </div>

          {/* ✅ NEW: Save All Changes Button */}
          {editingTableField && (
            <button
              onClick={() => {
                // Simple fix: Mark that prices were edited and refresh the view
                const currentVersion = selectedQuote.version || 1;
                const newVersion = currentVersion + 1;
                
                // Create new version with edited prices marked
                const newQuote = {
                  ...selectedQuote,
                  version: newVersion,
                  updatedDate: new Date().toISOString(),
                  editedPrices: tableEditValues,
                  hasEditedPrices: true
                };
                
                // Save as new version
                setQuotes([...quotes, newQuote]);
                
                // Refresh display by setting selected quote to new version
                setSelectedQuote(newQuote);
                
                // Clear editing mode
                setEditingTableField(null);
                
                // Reset edit values for next time
                setTableEditValues({ perWindowPrices: {}, motorCost: 80, taxRate: 0.0825 });
                
                // Show success and refresh the view
                alert(`✅ Success! Quote v${newVersion} created with your edited prices`);
                
                // Force re-render by clicking view quote again
                setTimeout(() => {
                  setCurrentView('viewQuote');
                  setSelectedQuote(newQuote);
                }, 500);
              }}
              style={{ width: '100%', padding: '14px', marginBottom: '24px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
            >
              💾 Save All Changes & Create New Version
            </button>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(copyText);
                setCopiedId(selectedQuote.id);
                setTimeout(() => setCopiedId(null), 2000);
              }}
              style={{ flex: 1, paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}
            >
              {copiedId === selectedQuote.id ? <Check size={16} /> : <Copy size={16} />}
              {copiedId === selectedQuote.id ? 'Copied!' : 'Copy'}
            </button>
            
            <button
              onClick={() => loadQuoteForEdit(selectedQuote)}
              style={{ paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Edit2 size={16} />
              Edit
            </button>
            
            <button
              onClick={() => {
                setQuotes(quotes.filter(q => q.id !== selectedQuote.id));
                setSelectedQuote(null);
              }}
              style={{ paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    );
    } catch (error) {
      console.error('Error rendering quote detail:', error);
      return (
        <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <button onClick={() => setSelectedQuote(null)} style={{ marginBottom: '24px', padding: '8px 16px', borderRadius: '8px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer' }}>← Back</button>
            <div style={{ background: '#2a1a1a', border: '1px solid #8b4444', borderRadius: '8px', padding: '24px', color: '#ff6666' }}>
              <p style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>⚠️ Error Loading Quote</p>
              <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>{error.message}</p>
              <p style={{ fontSize: '12px', color: '#666' }}>This may be an old quote format. Try creating a new quote or editing this one.</p>
            </div>
          </div>
        </div>
      );
    }
  };

  // Get latest version of each quote (deduplicate by ID, keep only newest)
  // ✅ NEW HELPER: Get room summary for collapsed view
  const getRoomSummary = (room) => {
    const totalWindows = room.windowGroups.reduce((sum, g) => sum + (parseInt(g.quantity) || 0), 0);
    const motorCount = room.windowGroups.filter(g => g.controlType === 'Motor').reduce((sum, g) => sum + (parseInt(g.quantity) || 0), 0);
    const firstGroup = room.windowGroups[0];
    const dimensions = firstGroup ? `${firstGroup.width || '?'}"W x ${firstGroup.height || '?'}"H` : '? x ?';
    const blindType = (room.blindTypes || ['Roller'])[0];
    
    return {
      windows: totalWindows,
      dimensions,
      fabric: room.fabricInput || blindType,
      motorCount
    };
  };

  // ✅ NEW HELPER: Toggle room expanded/collapsed
  const toggleRoomExpanded = (roomId) => {
    const newExpanded = new Set(expandedRooms);
    if (newExpanded.has(roomId)) {
      newExpanded.delete(roomId);
    } else {
      newExpanded.add(roomId);
    }
    setExpandedRooms(newExpanded);
  };

  const getLatestQuoteVersions = (quotesToProcess) => {
    const latestByID = {};
    
    quotesToProcess.forEach(quote => {
      if (!latestByID[quote.id]) {
        latestByID[quote.id] = quote;
      } else {
        // Compare dates - keep the one with latest updatedDate
        const currentDate = new Date(latestByID[quote.id].updatedDate || latestByID[quote.id].createdDate);
        const newDate = new Date(quote.updatedDate || quote.createdDate);
        
        if (newDate > currentDate) {
          latestByID[quote.id] = quote;
        }
      }
    });
    
    return Object.values(latestByID);
  };

  const renderStatistics = () => {
    const activeQuotes = quotes.filter(q => !q.archived);
    // ✅ FIX: Get only latest version of each quote
    const latestQuotes = getLatestQuoteVersions(activeQuotes);
    
    const stats = { monthlyStats: {}, totalProfit: 0, totalQuotes: 0, pendingOrders: 0 };
    
    // ✅ Use latestQuotes instead of activeQuotes
    latestQuotes.forEach(quote => {
      const date = new Date(quote.createdDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!stats.monthlyStats[monthKey]) {
        stats.monthlyStats[monthKey] = { quotes: 0, profit: 0 };
      }

      stats.monthlyStats[monthKey].quotes += 1;
      stats.totalQuotes += 1;

      let quoteProfit = 0;
      quote.rooms.forEach(room => {
        const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
        const motorizedCount = room.windowGroups.filter(w => w.controlType === 'Motor').length;
        
        // Determine blind type from ACTUAL FABRICS entered
        let actualBlindType = (room.blindTypes || ['Roller'])[0];
        if (fabricNumbers.length > 0) {
          for (const fabricNum of fabricNumbers) {
            const detectedType = getBlindTypeFromFabric(fabricNum, quote.pricing?.PRICING_DATA || PRICING_DATA);
            if (detectedType) {
              actualBlindType = detectedType;
              break;
            }
          }
        }
        
        room.windowGroups.forEach(group => {
          const q = calculateGroupQuote(group, fabricNumbers, actualBlindType, motorizedCount, quote.pricing || null);
          quoteProfit += q.profit;
        });
      });

      stats.monthlyStats[monthKey].profit += quoteProfit;
      stats.totalProfit += quoteProfit;
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    // ✅ Use latestQuotes for pending orders too
    latestQuotes.forEach(quote => {
      if (new Date(quote.createdDate) > sevenDaysAgo && quote.status === 'quote') {
        stats.pendingOrders += 1;
      }
    });

    const monthlyEntries = Object.entries(stats.monthlyStats).sort().reverse().slice(0, 12);

    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <button onClick={() => setCurrentView('menu')} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
              <ArrowLeft size={24} color="#aaa" />
            </button>
            <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' }}>Statistics</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
            <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
              <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Total Quotes</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>{stats.totalQuotes}</p>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
              <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Total Profit</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>${stats.totalProfit.toFixed(0)}</p>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
              <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Pending (7 days)</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>{stats.pendingOrders}</p>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
              <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Avg Profit/Quote</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>${(stats.totalProfit / Math.max(stats.totalQuotes, 1)).toFixed(0)}</p>
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #444', borderRadius: '8px', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={24} color="#d4af37" />
              Monthly Breakdown
            </h3>

            {monthlyEntries.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', paddingTop: '32px', paddingBottom: '32px' }}>No data yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {monthlyEntries.map(([month, data]) => (
                  <div key={month} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <p style={{ fontWeight: 'bold', color: '#fff' }}>{new Date(month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                      <span style={{ fontSize: '12px', paddingLeft: '12px', paddingRight: '12px', paddingTop: '4px', paddingBottom: '4px', borderRadius: '999px', background: '#d4af37', color: '#000' }}>{data.quotes} quotes</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div>
                        <p style={{ color: '#888', fontSize: '14px' }}>Profit: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>${data.profit.toFixed(0)}</span></p>
                      </div>
                      <div style={{ width: '128px', height: '32px', borderRadius: '4px', background: '#333' }}>
                        <div 
                          style={{ 
                            height: '100%',
                            borderRadius: '4px',
                            width: `${(data.profit / Math.max(...monthlyEntries.map(e => e[1].profit), 1)) * 100}%`,
                            background: 'linear-gradient(90deg, #d4af37, #f4e4c1)'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderQuoteForm = () => (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', paddingBottom: '48px', padding: '32px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <button onClick={() => { setCurrentView('menu'); resetForm(); setEditingQuote(null); }} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={24} color="#aaa" />
          </button>
          <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' }}>{editingQuote ? 'Edit Quote' : 'Create Quote'}</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          <input type="text" placeholder="Client Name" value={formData.clientName} onChange={(e) => setFormData({...formData, clientName: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '16px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white' }} />
          <input type="tel" placeholder="Client Phone" value={formData.clientPhone} onChange={(e) => setFormData({...formData, clientPhone: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '16px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white' }} />
          <input type="text" placeholder="Location / Address" value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '16px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white' }} />
          <input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '16px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white' }} />
        </div>

        <h3 style={{ fontWeight: 'bold', fontSize: '20px', color: '#fff', marginBottom: '24px', fontFamily: 'Georgia, serif' }}>Rooms & Windows</h3>

        {formData.rooms.map((room, roomIndex) => {
          const isExpanded = expandedRooms.has(room.id);
          const summary = getRoomSummary(room);

          return (
            <div key={room.id} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', marginBottom: '24px', overflow: 'hidden' }}>
              {/* COLLAPSED VIEW - Click to expand */}
              <button onClick={() => toggleRoomExpanded(room.id)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#d4af37', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span>{room.name || 'Unnamed Room'}</span>
                    <span style={{ fontSize: '13px', color: '#aaa' }}>({summary.windows} windows | {summary.dimensions})</span>
                    <span style={{ fontSize: '13px', color: '#888' }}>{summary.fabric}</span>
                    {summary.motorCount > 0 && <span style={{ fontSize: '13px', color: '#ffaa00' }}>Motor ({summary.motorCount})</span>}
                  </p>
                </div>
                <span style={{ color: '#888', fontSize: '16px' }}>{isExpanded ? '▼' : '▶'}</span>
              </button>

              {/* EXPANDED VIEW - Edit form */}
              {isExpanded && (
                <div style={{ background: '#1a1a1a', padding: '24px', borderTop: '1px solid #444' }}>
                  <input type="text" placeholder="Room Name (e.g., Living Room)" value={room.name} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].name = e.target.value; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold', fontSize: '16px', background: '#0a0a0a', border: '1px solid #d4af37', color: 'white' }} />

                  <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Fabric Numbers (comma-separated, or leave blank for Min/Max):</p>
                  <input type="text" placeholder="e.g., 82086K, 82067E (or leave blank)" value={room.fabricInput} onChange={(e) => { 
                    const newRooms = [...formData.rooms]; 
                    newRooms[roomIndex].fabricInput = e.target.value; 
                    
                    if (e.target.value.trim()) {
                      const detectedTypes = autoDetectBlindTypes(e.target.value);
                      newRooms[roomIndex].blindTypes = detectedTypes;
                    }
                    
                    setFormData({...formData, rooms: newRooms}); 
                  }} style={{ width: '100%', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', background: '#0a0a0a', border: '1px solid #666', color: 'white' }} />

                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 'bold', color: room.fabricInput.trim() ? '#4ade80' : '#888', marginBottom: '8px' }}>
                      {room.fabricInput.trim() 
                        ? `✅ Auto-Detected: ${(room.blindTypes || ['Roller']).join(', ')} (Click to change)`
                        : 'Blind Type (for Min/Max calculation) - Select one or more:'
                      }
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {['Roller', 'Zebra', 'Roman', 'Bamboo (Roller)', 'Bamboo (Roman)'].map(type => (
                        <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', background: (room.blindTypes || ['Roller']).includes(type) ? '#1a3a1a' : '#0a0a0a', border: (room.blindTypes || ['Roller']).includes(type) ? '1px solid #4ade80' : '1px solid #444', cursor: 'pointer', fontSize: '14px', color: (room.blindTypes || ['Roller']).includes(type) ? '#4ade80' : '#ccc', transition: 'all 0.2s' }}>
                          <input 
                            type="checkbox" 
                            checked={(room.blindTypes || ['Roller']).includes(type)}
                            onChange={(e) => { 
                              const newRooms = [...formData.rooms];
                              let types = room.blindTypes || ['Roller'];
                              if (e.target.checked) {
                                types = [...new Set([...types, type])];
                              } else {
                                types = types.filter(t => t !== type);
                              }
                              newRooms[roomIndex].blindTypes = types.length > 0 ? types : ['Roller'];
                              setFormData({...formData, rooms: newRooms}); 
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          {type}
                        </label>
                      ))}
                    </div>
                  </div>

                  <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#ccc', marginBottom: '12px' }}>Window Groups:</p>

                  {room.windowGroups.map((group, groupIndex) => (
                    <div key={group.id} style={{ background: '#0a0a0a', padding: '12px', borderRadius: '8px', marginBottom: '12px', border: '1px solid #555' }}>
                      <input type="number" placeholder="Qty" value={group.quantity} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].quantity = e.target.value; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '8px', borderRadius: '4px', fontSize: '16px', background: '#0a0a0a', border: '1px solid #666', color: 'white', marginBottom: '8px' }} />
                      <input type="text" placeholder="Width (e.g., 35, 3'6, 83in 12/16)" value={group.width} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].width = e.target.value; setFormData({...formData, rooms: newRooms}); setLastWidth(e.target.value); }} style={{ width: '100%', padding: '8px', borderRadius: '4px', fontSize: '16px', background: '#0a0a0a', border: '1px solid #666', color: 'white', marginBottom: '8px' }} />
                      <input type="text" placeholder="Height (e.g., 75, 6'3, 83in 12/16)" value={group.height} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].height = e.target.value; setFormData({...formData, rooms: newRooms}); setLastHeight(e.target.value); }} style={{ width: '100%', padding: '8px', borderRadius: '4px', fontSize: '16px', background: '#0a0a0a', border: '1px solid #666', color: 'white', marginBottom: '12px' }} />

                      <select value={group.mount} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].mount = e.target.value; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '8px', borderRadius: '4px', fontSize: '14px', background: '#0a0a0a', border: '1px solid #666', color: 'white', marginBottom: '8px' }}>
                        <option>Inside</option>
                        <option>Outside</option>
                        <option>Outside-NoReduc</option>
                      </select>
                      <select value={group.controlType || 'Manual'} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].controlType = e.target.value; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '8px', borderRadius: '4px', fontSize: '14px', background: '#0a0a0a', border: '1px solid #666', color: 'white', marginBottom: '12px' }}>
                        <option value="Manual">Manual</option>
                        <option value="Cordless">Cordless</option>
                        <option value="Motor">Motor</option>
                      </select>

                      {(group.controlType || 'Manual') === 'Motor' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', color: '#ccc', marginBottom: '6px' }}>
                          <input type="checkbox" checked={group.solar} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].solar = e.target.checked; setFormData({...formData, rooms: newRooms}); }} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />Solar (+$40)
                        </label>
                      )}

                      <div style={{ padding: '8px', borderRadius: '6px', background: '#2a3a2a', marginBottom: '8px', border: '1px solid #4a6a4a' }}>
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#aaa', marginBottom: '6px' }}>Surcharge Override (Optional)</p>
                        <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>Auto: ${(() => { try { const widthVal = (group.width || '').trim(); const heightVal = (group.height || '').trim(); const w = widthVal ? getWidthSurcharge(widthVal) : 0; const h = heightVal ? getHeightSurcharge(heightVal) : 0; const total = w + h; return isNaN(total) ? '0' : total.toFixed(0); } catch(e) { console.error('Surcharge calc error:', e); return '0'; } })()} {group.surchargeOverride !== null && `→ Overridden: $${group.surchargeOverride.toFixed(0)}`}</p>
                        <input type="number" placeholder="Leave blank to use auto-calculated" value={group.surchargeOverride !== null ? group.surchargeOverride : ''} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].surchargeOverride = e.target.value === '' ? null : parseFloat(e.target.value) || 0; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '6px', borderRadius: '4px', fontSize: '12px', background: '#0a0a0a', border: '1px solid #555', color: 'white', marginBottom: '6px' }} />
                        <button onClick={() => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].surchargeOverride = null; setFormData({...formData, rooms: newRooms}); }} style={{ fontSize: '10px', padding: '4px 8px', background: 'transparent', color: '#888', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}>Reset to Auto</button>
                      </div>

                      <button onClick={() => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups.splice(groupIndex, 1); setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '8px', marginTop: '8px', borderRadius: '4px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Trash2 size={14} /> Delete This Window Group
                      </button>
                    </div>
                  ))}

                  <button onClick={() => { const newRooms = [...formData.rooms]; const newWindowId = Math.max(...newRooms[roomIndex].windowGroups.map(w => w.id)) + 1; newRooms[roomIndex].windowGroups.push({ id: newWindowId, quantity: '', width: lastWidth, height: lastHeight, controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null }); setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '12px', borderRadius: '4px', color: '#888', fontWeight: 'bold', fontSize: '16px', background: 'transparent', border: '2px dashed #666', cursor: 'pointer' }}>+ Add Window Group</button>

                  <button onClick={() => { const newRooms = [...formData.rooms]; newRooms.splice(roomIndex, 1); setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '12px', marginTop: '12px', borderRadius: '4px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Trash2 size={16} /> Delete This Room
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button onClick={() => { const newRoomId = Math.max(...formData.rooms.map(r => r.id), 0) + 1; setFormData({...formData, rooms: [...formData.rooms, { id: newRoomId, name: '', fabricInput: '', blindTypes: ['Roller'], windowGroups: [{ id: 1, quantity: '', width: lastWidth, height: lastHeight, controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null }] }]}); }} style={{ width: '100%', padding: '16px', borderRadius: '4px', color: '#888', fontWeight: 'bold', fontSize: '16px', background: 'transparent', border: '2px dashed #666', cursor: 'pointer', marginBottom: '32px' }}>+ Add Room</button>

        <button onClick={generateQuote} style={{ width: '100%', padding: '16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}>{editingQuote ? 'Save as New Version' : 'Generate Quote'}</button>
      </div>
    </div>
  );

  return (
    <div>
      {currentView === 'menu' && renderMenu()}
      {currentView === 'quote' && renderQuoteForm()}
      {currentView === 'history' && renderHistory()}
      {currentView === 'statistics' && renderStatistics()}
    </div>
  );
}
