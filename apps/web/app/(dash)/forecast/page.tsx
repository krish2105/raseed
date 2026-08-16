import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata = { title: 'Forecast · RASEED' }

export default function Page() {
  return (
    <ComingSoon title="Forecast" session="session 20">
      Holt-Winters point forecast with a block-bootstrap fan at P10/P50/P90, and holdout MAPE reported on screen. A forecast without an error bar is decoration.
    </ComingSoon>
  )
}
