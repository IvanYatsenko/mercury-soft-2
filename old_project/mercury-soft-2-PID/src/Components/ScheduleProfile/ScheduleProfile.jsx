import React from 'react'
import { observer } from 'mobx-react-lite'
import ReactECharts from 'echarts-for-react'
// import { LineChart, lineElementClasses } from '@mui/x-charts'

const progressMap = (state) => [state.second, state.temperature.t2]
const progressMapBoard = (state) => [state.second, state.temperature.t1]
const profileMap = (p) => [p.second, p.temperature]
const tooltipFormatter = (params) =>
  params.value[0] + 'сек</br/>' + params.value[1] + '&#176C '

export const ScheduleProfile = observer(
  ({
    points = [],
    progress = [],
    isBoardTemp = false,
    height = '60vh',
    width = '350px',
    deviationProfileSheldule = 0,
    deviationsPoints = []
  }) => {
    const style = {
      height: height,
      width: width,
      float: 'left',
      marginTop: '-15px'
    }

    const absolutePoints = (points) => {
      if (points.length === 0) {
        return []
      }

      const [first, ...rest] = points

      return rest.reduce(
        (arr, cur) => {
          const last = arr[arr.length - 1]
          arr.push({
            second: cur.second + last.second,
            temperature: cur.temperature
          })
          return arr
        },
        [first]
      )
    }

    // const Chart = ({ progress, profile, board }) => {
    const t1 = isBoardTemp
      ? progress.map(progressMapBoard)
      : progress.map(progressMap)
    const t2 = isBoardTemp ? progress.map(progressMapBoard) : 0
    const profileData = absolutePoints(points).map(profileMap)
    const deviationPointsData = isBoardTemp
    ? deviationsPoints.map(progressMapBoard)
    : deviationsPoints.map(progressMap)

    const option = {
      title: {
        show: false
      },
      tooltip: {
        formatter: tooltipFormatter
      },
      grid: {
        left: 30,
        top: 25,
        right: 25,
        bottom: 30
      },
      xAxis: [
        {
          type: 'value',
          scale: true
        }
      ],
      yAxis: [
        {
          type: 'value',
          scale: true
        }
      ],
      series: [
        {
          name: 'III',
          type: 'scatter',
          data: t1,
          smooth: 0.15,
          z: 4
        },
        {
          name: 'II',
          type: 'scatter',
          data: t2,
          smooth: 0.15,
          z: 5
        },
        {
          name: 'line',
          type: 'line',
          data: profileData,
          smooth: 0.15,
          z: 10
        },
        {
          name: 'I',
          type: 'scatter',
          data: deviationPointsData,
          smooth: 0.15,
          z: 0
        },
        {
          name: 'I',
          type: 'scatter',
          data: deviationPointsData,
          smooth: 0.15,
          z: 100
        },
      ]
    }

    return (
      <ReactECharts
        option={option}
        style={style}
        lazyUpdate
        opts={{ renderer: 'svg' }}
      />
      // <LineChart
      //   xAxis={xAxis}
      //   yAxis={yAxis}
      //   sx={{
      //     [`& .${lineElementClasses.root}`]: {
      //       strokeWidth: 5,
      //     },
      //   }}
      //   series={[
      //     {
      //       connectNulls: true,
      //       data: pointsX,
      //       color: '#2e7d32',
      //       showMark: false,
      //     },
      //     {
      //       data: workPointsX,
      //       color: '#d51010',
      //       showMark: false,
      //     },
      //   ]}
      //   margin={{ top: 15, bottom: 18, left: 30, right: 25 }}
      //   width={310}
      //   height={175}
      // />
    )
  }
)
