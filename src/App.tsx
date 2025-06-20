import { useState } from 'react';
import './App.css';
import { createWorker } from 'tesseract.js';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({apiKey:import.meta.env.VITE_GOOGLE_API_KEY})

const parseText = async (text: string) => {
  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: "Parse the following RAW OCR to receipt text and return ONLY the JSON object, no markdown wrappers or additional text: " + text
  });

  let jsonString = result.text;

  if (jsonString && jsonString.startsWith('```json')) {
    jsonString = jsonString.substring(7);
    if (jsonString && jsonString.endsWith('```')) {
      jsonString = jsonString.slice(0, -3);
    }
  } else if (jsonString && jsonString.startsWith('```')) {
    jsonString = jsonString.substring(3);
    if (jsonString && jsonString.endsWith('```')) {
      jsonString = jsonString.slice(0, -3);
    }
  }

  jsonString = jsonString!.trim();
  // console.log("Attempting to parse JSON string:", jsonString);
  return JSON.parse(jsonString!);
}

interface Item {
  name: string;
  price: number;
  quantity: number;
}

// Tambahkan interface untuk Bank
interface BankAccount {
  bankName: string;
  accountNumber: string;
}

// Tambahkan interface untuk People (lebih spesifik)
interface Person {
  name: string;
  phone: string;
  selectedItems: Item[];
  tip: number; // Tambahkan tip di sini
  banks: BankAccount[]; // Tambahkan array banks di sini
  totalDue: number; // Total amount due including items and tip
}


const readReceipt = async (file: File) => {
  const worker = await createWorker('eng');
  const { data: { text } } = await worker.recognize(file);
  await worker.terminate();
  return text;
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  // State untuk input modal
  const [personName, setPersonName] = useState(''); // Ubah dari 'name' agar tidak konflik
  const [personPhone, setPersonPhone] = useState(''); // Ubah dari 'phone'
  const [tipPercentage, setTipPercentage] = useState<number>(0); // State untuk tip (dalam persentase)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]); // State untuk daftar bank

  const [people, setPeople] = useState<Person[]>([]); // Gunakan interface Person
  const [selectedItems, setSelectedItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  // State untuk input bank baru sementara
  const [newBankName, setNewBankName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');

  // State untuk input item baru sementara
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');

  const handleSplitBill = async () => {
    if (!file) {
      setError("Pilih file dulu atuh.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rawText = await readReceipt(file);
      const parsedData = await parseText(rawText); 
      
      if (!parsedData || !Array.isArray(parsedData.items)) {
          throw new Error("AI nya lagi ngambek 😡.");
      }

      const itemsToSet = parsedData.items.map((item: any) => {
        const unitPrice = (item.quantity && item.quantity > 0) ? item.price / item.quantity : item.price; 
        return {
          ...item,
          price: typeof unitPrice === 'number' && !isNaN(unitPrice) ? unitPrice : 0,
          quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1 
        };
      });

      setParsedItems(itemsToSet);
      
    } catch (err) {
      console.error("Error gak bisa di proses", err);
      setError(`Gagal di proses. Error: ${err instanceof Error ? err.message : String(err)}. Coba lagi ya.`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItems = (e: React.FormEvent) => {
    e.preventDefault();

    const selectedItemsData: Item[] = [];
    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[name="items"]');

    checkboxes.forEach((checkbox: HTMLInputElement, index: number) => {
        if (checkbox.checked) {
            const itemInState = parsedItems[index];
            if (itemInState) { 
                selectedItemsData.push({
                    name: itemInState.name,
                    quantity: itemInState.quantity, 
                    price: itemInState.price        
                });
            }
        }
    });

    setSelectedItems(selectedItemsData);
    document.getElementById('addPeopleModal')?.showModal();
  };

  const handleAddItem = () => {
    const newItem = {
      name: newItemName,
      price: Number(newItemPrice),
      quantity: Number(newItemQuantity)
    };
    setParsedItems([...parsedItems, newItem]);
    document.getElementById('addItemModal')?.close();
    setNewItemName('');
    setNewItemPrice('');
    setNewItemQuantity('');
  };

  const handleAddBankAccount = () => {
    if (newBankName.trim() && newAccountNumber.trim()) {
      setBankAccounts([...bankAccounts, { bankName: newBankName.trim(), accountNumber: newAccountNumber.trim() }]);
      setNewBankName(''); // Reset input
      setNewAccountNumber(''); // Reset input
    } else {
      alert("Please enter both bank name and account number.");
    }
  };

  const handleRemoveBankAccount = (indexToRemove: number) => {
    setBankAccounts(bankAccounts.filter((_, index) => index !== indexToRemove));
  };


  // Function ini dipanggil saat tombol "Add" di modal diklik
  const handleAddPeople = () => {
    // Validasi dasar
    if (!personName.trim()) {
        alert("Please enter a name for the person.");
        return;
    }
    if (selectedItems.length === 0) {
        alert("Please select at least one item for this person.");
        return;
    }

    // Hitung total harga item yang dipilih
    const subtotal = selectedItems.reduce((total, item) => total + item.price * item.quantity, 0);
    // Hitung tip berdasarkan persentase
    const calculatedTip = (tipPercentage / 100) * subtotal;
    const totalWithTip = subtotal + calculatedTip;

    setPeople([
      ...people,
      { 
        name: personName, 
        phone: personPhone, 
        selectedItems: selectedItems,
        tip: calculatedTip, // Simpan nilai tip yang sudah dihitung
        banks: bankAccounts, // Simpan daftar bank yang sudah ditambahkan
        totalDue: totalWithTip // Simpan total yang harus dibayar orang ini
      }
    ]);

    // Opsi 1: Reset input modal setelah menambahkan orang
    // Ini akan membuat modal bersih untuk entri berikutnya.
    // Jika Anda ingin mempertahankan nilai, komentar baris ini.
    setPersonName('');
    setPersonPhone('');
    setSelectedItems([]); // Reset item yang dipilih di tabel utama

    // Tutup modal
    document.getElementById('addPeopleModal')?.close();
  };

  const handleRemovePeople = (index: number) => {
    const newPeople = [...people];
    newPeople.splice(index, 1);
    setPeople(newPeople);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...parsedItems];
    newItems.splice(index, 1);
    setParsedItems(newItems);
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>, indexToUpdate: number) => {
    const rawValue = e.target.value;
    const newValue = parseInt(rawValue, 10);

    const finalQuantity = isNaN(newValue) || newValue < 0 ? 0 : newValue;

    const updatedItems = [...parsedItems];
    if (updatedItems[indexToUpdate]) { 
      updatedItems[indexToUpdate] = {
        ...updatedItems[indexToUpdate],
        quantity: finalQuantity,
      };
      setParsedItems(updatedItems);
    }
  };

  return (
    // Home
    <div className='p-5 rounded-xl border space-y-3 border-black shadow-xl'>
      <h1 className='font-semibold text-4xl text-center'>Split Bill</h1>
      <p className='text-center'>Gapang bagi nya, mudah nge share nya langsung pake whatsapp</p>
      {/* Tabs */}
      <section className='tabs tabs-border'>
        {/* Upload Struk */}
        <input type="radio" className='tab' name='tabs' aria-label="Upload Struk" defaultChecked/>
        <div className='tab-content mt-5'>
          <div className='flex flex-col gap-2'>
            <label htmlFor="file">Upload Strukmu</label>
            <input
              type="file"
              className='file-input file-input-bordered file-input-neutral w-full'
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
            />
            <button
              className='btn btn-neutral'
              onClick={handleSplitBill}
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Split'}
            </button>
            {error && <p className="text-red-600 mt-2">{error}</p>}
          </div> 
        </div>
        {/* Input Manual */}
        <input type="radio" className='tab' name='tabs' aria-label="Input Manual"/>
        <div className='tab-content mt-5'>
          <button className='btn btn-neutral' onClick={() => document.getElementById('addItemModal')?.showModal()}>Tambah Item Manual</button>
        </div>
      </section>
       
        {/* Detail Item */}
        {parsedItems.length > 0 && (
        <form onSubmit={handleAddItems} className='overflow-x-auto mt-10'>
          <table className="table table-zebra border border-black mx-auto">
            <thead>
              <tr>
                <th></th>
                <th>Nama</th>
                <th>Jumlah</th>
                <th>Harga (Unit)</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parsedItems.map((item: Item, index: number) => (
                <tr key={index}>
                  <td><input type="checkbox" name="items" /></td>
                  <td>{item.name}</td>
                  <td>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(e, index)}
                      min="0"
                    />
                  </td>
                  <td>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(item.price)}</td>
                  <td>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(item.price * item.quantity)}</td>
                  <td><button type="button" className="btn btn-error btn-xs" onClick={() => handleRemoveItem(index)}>Hapus</button></td>
                </tr>
              ))}
              <tr>
                <th>Total</th>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <th>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(parsedItems.reduce((total: number, item: Item) => total + item.price * item.quantity, 0))}</th>
              </tr>
            </tbody>
          </table>
          <div className='flex justify-center gap-2 my-5'>
            <button className='btn btn-neutral' type="button" onClick={() => document.getElementById('addItemModal')?.showModal()}>Tambah Item</button>
            <button className='btn btn-neutral' type="submit">Add People</button>
          </div>
        </form>
      )}

      {/* People */}
      {people.length > 0 && (
        <div className="my-5 grid grid-cols-3 gap-5">
          {people.map((person: Person, pIndex: number) => ( // Gunakan Person interface
            <div key={pIndex} className='card bg-base-200 shadow-xl'>
              <div className="card-body">
                <div className='flex justify-between'>
                  <h2 className="card-title">{person.name}</h2>
                  <div>
                    <a href={`https://wa.me/62${person.phone}?text=Halo, ${person.name}. Kamu ada bill yang belum dibayar sebanyak ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(person.totalDue)} kamu bisa bayar melalui ${person.banks.map((bank) => bank.bankName + ' - ' + bank.accountNumber ).join(', ')}. Thank you. ~ Pesan digenerate pake SplitBill`} target="_blank" rel="noopener noreferrer" className='btn btn-primary btn-xs' >Tagih</a>
                    <button className='btn btn-error btn-xs' onClick={() => handleRemovePeople(pIndex)}>Hapus</button>
                  </div>
                </div>
                {person.selectedItems.map((item: Item, itemIndex: number) => (
                  <div key={itemIndex}>
                    <div className='flex justify-between'>
                      <p>{item.name}</p>
                      <p>x{item.quantity}</p>
                      <p>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(item.price * item.quantity)}</p>
                    </div>
                    <hr />
                  </div>
                ))}
                {/* Tampilkan detail tip dan bank */}
                <p>Pajak ({person.tip > 0 ? (person.tip / person.selectedItems.reduce((total, item) => total + item.price * item.quantity, 0) * 100).toFixed(0) : 0}%): {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(person.tip)}</p>
                <p className="font-bold">Total Due: {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(person.selectedItems.reduce((total, item) => total + (item.price * item.quantity), 0) + person.tip)}</p>
                {person.banks.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold">Bank Accounts:</p>
                    {person.banks.map((bank, bankIndex) => (
                      <p key={bankIndex} className="text-sm">
                        {bank.bankName}: {bank.accountNumber}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add People */}
      <dialog id="addPeopleModal" className="modal">
        <div className="modal-box space-y-2">
          <h3 className="font-bold text-lg">Tambah Temenmu</h3>
          <input type="text" className='input input-bordered input-neutral w-full' placeholder="Nama" value={personName} onChange={(e) => setPersonName(e.target.value)} />
          <label className='input input-bordered input-neutral w-full flex items-center'>
            <span className="label">62</span>
            <input type="tel" placeholder="Nomor WhatsApp" value={personPhone} onChange={(e) => setPersonPhone(e.target.value)} />
          </label>
          {/* Input Tip */}
          <label className='input input-bordered input-neutral w-full flex items-center'>
            <input
              type="number"
              placeholder="Pajak"
              value={tipPercentage}
              onChange={(e) => setTipPercentage(parseInt(e.target.value))} // Pastikan ini angka
              min="0"
              max="100" // Batasan persentase
            />
            <span>%</span>
          </label>
          
          {/* Input untuk menambahkan bank baru */}
          <div className="flex gap-2">
            <input type="text" className='input input-bordered input-neutral w-1/2' placeholder="Nama Bank" value={newBankName} onChange={(e) => setNewBankName(e.target.value)} />
            <input type="text" className='input input-bordered input-neutral w-1/2' placeholder="Nomor Rekening" value={newAccountNumber} onChange={(e) => setNewAccountNumber(e.target.value)} />
            <button type="button" className="btn btn-primary" onClick={handleAddBankAccount}>Tambah Bank</button>
          </div>

          {/* Daftar Bank yang sudah ditambahkan */}
          {bankAccounts.length > 0 && (
            <div className="space-y-1">
              <p className="font-semibold">Added Bank Accounts:</p>
              {bankAccounts.map((bank, index) => (
                <div key={index} className="flex justify-between items-center bg-gray-100 p-2 rounded">
                  <span>{bank.bankName}: {bank.accountNumber}</span>
                  <button type="button" className="btn btn-error btn-xs" onClick={() => handleRemoveBankAccount(index)}>Hapus</button>
                </div>
              ))}
            </div>
          )}

          <button type="button" className="btn btn-neutral w-full" onClick={handleAddPeople}>Tambah</button> {/* Ubah ke type="button" agar tidak menutup form otomatis */}
        </div>
          <form method="dialog" className="modal-backdrop">
            <button>Close</button>
          </form>
      </dialog>

      {/* Modal Add Item */}
      <dialog id="addItemModal" className="modal">
        <div className="modal-box space-y-2">
          <h3 className="text-lg font-bold">Tambah Item</h3>
          <div className="flex flex-col gap-2">
            <input type="text" placeholder="Nama Item" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="input input-bordered input-neutral w-full" />
            <input type="number" placeholder="Harga" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} className="input input-bordered input-neutral w-full" />
            <input type="number" placeholder="Jumlah" value={newItemQuantity} onChange={(e) => setNewItemQuantity(e.target.value)} className="input input-bordered input-neutral w-full" />
            <button type="submit" className="btn btn-primary w-full" onClick={handleAddItem}>Tambah</button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
      <div className=' alert alert-warning'>Kalo AI nya agak nggak akurat, minta maaf ya bisa dicoba ulang lagi atau input manual dulu aja 🥺</div>
      <p className="text-center text-xs text-gray-500 mt-10">Made with <span className="animate-pulse">❤️</span> by <a href="https://raybrilliant.pages.dev" target="_blank" className="font-semibold">Raybrilliant</a></p>
    </div>
  );
}

export default App;