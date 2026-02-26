import './App.css'
import { Header } from './components/Header'
import { PlayerCardGrid } from './components/PlayerCardGrid'
import { HeartRateChart } from './components/HeartRateChart'

function App() {
  return (
    <>
      <Header />
      <PlayerCardGrid />
      <HeartRateChart />
    </>
  )
}

export default App
