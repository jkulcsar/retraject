
		#ifndef _LINEAR_H
		#include "linear.h"
		#endif

		#ifndef __IOSTREAM_H
		#include <iostream.h>
		#endif

		#ifndef  __MATH_H
		#include <math.h>
		#endif

		#ifndef _ANEXA_H
		#include "anexa.h"
		#endif

		#ifndef _JOINTYP_H
		#include "jointyp.h"
		#endif



		float	Linear::RPos( float t )
		{
			float	result;

			result = ( float )( t / m_fTrajectoryTime );

			return result;
		}



		float	Linear::RSpd( )
		{
			float result;

			result = ( float )( 1 / m_fTrajectoryTime );

			return result;
		}



		float	Linear::RAcc( )
		{
			float result;

			result = ( float ) 0;

			return result;
		}



		float	Linear::m_ComputeTrajectoryTime( void )
		{
				float	result;

				result = ( float )( ABS(D()) / m_fKV  );

				if( result >= 0 )
					return result;
				else
					return 0;
		}



		BOOL	Linear::m_ComputeLambda( void )
		{
				// m_fTrajectoryTime must be found out by the Robot !

				if( m_fTrajectoryTime > 0 )
				{
					m_fLambda = (float) ( m_ComputeTrajectoryTime() / m_fTrajectoryTime );

					// reducing maximum speed by the factor m_fLamda
					m_fKV	  = (float) ( m_fKV * m_fLambda );

					return TRUE;
				}
				else
					return FALSE;
		}




		BOOL	Linear::m_ComputePosition( void )
		{
				float	time;		// counter for current time
				float	step;		// stepping through the total time;
				UINT	i;			// counter for array

				if( m_uiNrOfValues > 0 )
					m_pfPosition = (float*) new float[ m_uiNrOfValues ];

				if( m_pfPosition != NULL )
				{
					step = m_fTrajectoryTime / m_uiDivisions;
					time = 0;
					for( i=0; i<m_uiNrOfValues; i++ )
					{
						m_pfPosition[i] = (float)( m_fInitialPosition + RPos( time ) * D() );
						time += step;
					}
					return TRUE;
				}
				else
					return FALSE;
		}



		BOOL	Linear::m_ComputeSpeed( void )
		{
				float	time;		// counter for current time
				float	step;		// stepping through the total time;
				UINT	i;			// counter for array

				if( m_uiNrOfValues > 0 )
					m_pfSpeed = (float*) new float[ m_uiNrOfValues ];

				if( m_pfSpeed != NULL )
				{
					step = m_fTrajectoryTime / m_uiDivisions;
					time = 0;
					for( i=0; i<m_uiNrOfValues; i++ )
					{
						m_pfSpeed[i] = (float)( RSpd() * D() );
						time += step;
					}
					return TRUE;
				}
				else
					return FALSE;

		}




		BOOL	Linear::m_ComputeAcceleration( void )
		{
				float	time;		// counter for current time
				float	step;		// stepping through the total time;
				UINT	i;			// counter for array

				if( m_uiNrOfValues > 0 )
					m_pfAcceleration = (float*) new float[ m_uiNrOfValues ];

				if( m_pfAcceleration != NULL )
				{
					step = m_fTrajectoryTime / m_uiDivisions;
					time = 0;
					for( i=0; i<m_uiNrOfValues; i++ )
					{
						m_pfAcceleration[i] = (float)( RAcc() * D() );
						time += step;
					}
					return TRUE;
				}
				else
					return FALSE;

		}



		Linear::Linear(  void )
		{
			m_uiType = LINEAR;
		}


		Linear::~Linear( void )
		{
			// do nothing ...
		}
