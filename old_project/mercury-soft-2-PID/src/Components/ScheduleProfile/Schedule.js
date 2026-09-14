export const createSchedule = (points, workPoints=[]) => {
  const labels = []
  const pointsData = {
    datasets: [
      {
        data: [],
        borderColor: '#2e7d32',
        backgroundColor: '#2e7d32',
      },
    ],
  }

  if (workPoints.lenght > 0) {
    pointsData.datasets.push({
      data: [],
      borderColor: '#d51010',
      backgroundColor: '#d51010',
    })
  }

  let seconds = 0
  // pointsData.datasets[0].data[0] = 20
  // labels[0] = seconds

  points.forEach((element, index) => {
    seconds += element.second
    labels[index] = seconds

    pointsData.datasets[0].data[index] = element.temperature
  })

  workPoints.forEach((element, index) => {
    pointsData.datasets[1].data[index] = element.temperature
  })

  //   for(let i = 0; i < 20; i++) {
  //     labels[i] = i
  //     pointsData.datasets[0].data[i] = Math.floor(Math.random() * 10) + 1
  //     if(i === 0) {
  //     labels[i] = 'sec'
  //     }
  //   }

  pointsData.labels = labels

  return pointsData
}
